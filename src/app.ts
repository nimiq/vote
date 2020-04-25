import '@nimiq/style/nimiq-style.min.css';
import '@nimiq/vue-components/dist/NimiqVueComponents.css';
import { Component, Vue, Watch } from 'vue-property-decorator';
import HubApi from '@nimiq/hub-api';
import stringHash from 'string-hash';
import draggable from 'vuedraggable';
import { Tooltip, InfoCircleSmallIcon, CloseIcon } from '@nimiq/vue-components';

import { BaseVote, VoteTypes, BaseChoice, Config, Option, ElectionResults, CastVote, ElectionVote }
    from './lib/types';
import { loadNimiqCoreOnly, loadNimiqWithCryptography } from './lib/CoreLoader';
import { serializeVote, parseVote, voteTotalWeight, voteAddress } from './lib/votes';
import { loadConfig, loadResults } from './lib/data';
import { findTxBetween, watchApi, blockRewardsSince } from './lib/network';
import { testnet, debug, dummies, contactInfo } from './lib/const';

const distinctColors = require('distinct-colors').default;

Vue.mixin({
    created() {
        const enums: any = { VoteTypes };
        const target = this as any;
        for (const name of Object.keys(enums)) {
            target[name] = Object.freeze(enums[name]);
        }
    },
});

type Error = {
    message: string,
    solution: string,
    reason: string,
}

const appLogo = `${window.location.origin}/android-icon-192x192.png`;

@Component({ components: { draggable, Tooltip, InfoCircleSmallIcon, CloseIcon } })
export default class App extends Vue {
    loading = true;
    testnet = testnet;
    debug = debug;
    dummies = dummies;
    error: Error | null = null;
    configs: Array<Config> = [];

    votingConfig: Config | null = null; // current voting
    votingAddress: string | null = null; // address to vote to
    private hub: HubApi = new HubApi(testnet ? 'https://hub.nimiq-testnet.com' : 'https://hub.nimiq.com');
    // vote: Receipt | null = localStorage.vote ? JSON.parse(localStorage.vote) : null;
    vote: CastVote | null = localStorage.vote ? JSON.parse(localStorage.vote) : null;
    newlyVoted = false;
    errorVoting = '';

    choices: Option[] = [];
    singleChoice: string = '';
    multipleChoices: string[] = [];

    client?: Nimiq.Client;
    consensus = false;
    height = 0;

    pastVotings: Array<Config> = [];

    resultHeight: number = 0;
    resultsConfig: Config | null = null; // current results showing
    currentResults: ElectionResults | false | null = null;
    preliminaryResults: ElectionResults | null = null;
    colors: any;

    async created() {
        (window as any).app = this;
        const start = new Date().getTime();
        const error = (message: string, reason: Error | string, solution: string = contactInfo) => {
            reason = reason.toString();
            this.error = { message, reason, solution };
            throw new Error(`${message}: ${reason}`);
        };

        // Load config and block height.
        console.log('Loading voting app');
        try {
            this.configs = await loadConfig();
            this.height = (await watchApi('latest/1', testnet))[0].height;
        } catch (e) {
            if (!this.configs || !this.height) {
                console.log('Loading voting app: Loading configuration failed', this.configs, this.height, e);
                error('Something went wrong loading the configuration files.', e,
                    'Are you offline? Adblocker enabled? Maybe have a look and reload.');
            }
        }

        console.log('Loading voting app: Loaded config', new Date().getTime() - start, this.height, this.configs);

        // Parse config and find current voting.
        const { configs, height, choices } = this;
        const activeConfigs = configs.filter((config) => config.start <= height && config.end > height);
        if (activeConfigs.length > 1) {
            error('Voting misconfigured.', 'More than one active voting is not permitted.');
        }
        if (activeConfigs.length === 1) {
            const [config] = activeConfigs;
            if (config.choices.length < 1) {
                error('Voting misconfigured.', 'No choices configured.');
            }
            for (const choice of config.choices) {
                choices.push({
                    label: choice.label || choice.name,
                    name: choice.name,
                    weight: config.type === VoteTypes.weightedChoices ? 50 : 1,
                });
            }

            // config for current voting loaded
            this.votingConfig = config;
            this.votingAddress = await voteAddress(this.votingConfig, true);
        }

        // Find past votings
        this.pastVotings = this.configs
            .filter((config) => config.end <= height)
            .sort((a, b) => b.end - a.end); // latest first
        const [latestVoting] = this.pastVotings;
        if (!this.votingConfig && latestVoting) {
            // No voting right now, try loading latest results
            await this.showFinalResults(latestVoting);
        }

        // Essential loading completed, update UI and load Nimiq lib in the background
        console.log('Loading voting app: Parsed config', new Date().getTime() - start, this.choices);
        this.loading = false;
        await Vue.nextTick();

        try {
            const Nimiq = await loadNimiqCoreOnly();
            await loadNimiqWithCryptography(!testnet);

            // Initialize Nimiq
            if (!(Nimiq.GenesisConfig as any)._config) {
                if (testnet) Nimiq.GenesisConfig.test(); else Nimiq.GenesisConfig.main();
            }
            this.client = Nimiq.Client.Configuration.builder().instantiateClient();
        } catch (e) {
            if (!this.client) {
                error('Something went wrong loading the Nimiq API.', e,
                    'Are you offline? Adblocker enabled? Maybe have a look and reload.');
            }
        }

        const client = this.client!;
        client.addConsensusChangedListener((state) => {
            this.consensus = state === Nimiq.Client.ConsensusState.ESTABLISHED;
        });
        client.addHeadChangedListener(async () => {
            this.height = await client.getHeadHeight();
            if (this.votingConfig?.end === this.height) {
                // When the vote has just ended, print the results to console
                const results = await this.showPreliminaryResults();
                console.warn(`Voting results for ${this.votingConfig.name}:`);
                console.log(JSON.stringify(results));
                console.log(results);
            }
        });

        // Loading Nimiq completed, update UI and wait for consensus and load results in background
        console.log('Loading voting app: Loaded Nimiq', new Date().getTime() - start, client);
        await Vue.nextTick();
        await client.waitForConsensusEstablished();

        // No voting and no final results > show preliminary results
        if (!this.votingConfig && latestVoting && !this.currentResults) {
            this.showPreliminaryResults(latestVoting);
        } else if (this.votingConfig && !this.currentResults) {
            // Voting is taking place; loading results in the background so the user doesn't have to wait after voting
            await this.showPreliminaryResults();
        }

        console.log('Loading voting app: Counted votes',
            new Date().getTime() - start,
            JSON.stringify(this.currentResults, null, '  '),
        );
    }

    @Watch('currentResults')
    makeColors() {
        if (!this.currentResults) return; // No results, no colors.
        const colors = Math.min(this.currentResults.stats.votes * 2, 100);
        this.colors = distinctColors({
            count: colors,
            lightMin: 65,
            lightMax: 80,
            chromaMin: 40,
            chromaMax: 50,
        }).map((color: any) => color.hex());
    }

    serializeChoices(): BaseChoice[] {
        const { type } = this.votingConfig!;
        switch (type) {
            case VoteTypes.singleChoice:
                return [{ name: this.singleChoice, weight: 1 }];
            case VoteTypes.multipleChoice: {
                return this.multipleChoices
                    .map((choice) => ({ name: choice, weight: 1 }));
            }
            case VoteTypes.weightedChoices: {
                const total = voteTotalWeight(this.choices);
                return this.choices.map((choice) => ({
                    name: choice.name,
                    weight: (choice.weight / total) * 100,
                }));
            }
            case VoteTypes.ranking: {
                return this.choices.map((choice, pos) => ({ name: choice.name, weight: this.choices.length - pos }));
            }
            default: throw new Error(`Vote type "${type}" not implemented!`);
        }
    }

    async trySubmittingVote() {
        try {
            this.submitVote();
        } catch (error) {
            this.errorVoting = error.message;
        }
    }

    async submitVote() {
        const { votingConfig: config, hub, height, votingAddress } = this;
        const vote: BaseVote = { name: config!.name, choices: this.serializeChoices() };
        const serialized = serializeVote(vote, config!.type);
        console.log('Submitted vote:', serialized);
        console.log('parsed', parseVote(serialized, config!));

        const signedTransaction = await hub.checkout({
            appName: 'Nimiq Voting App',
            shopLogoUrl: appLogo,
            recipient: votingAddress!,
            value: 1,
            extraData: serialized,
            validityDuration: Math.min(120, config!.end - height),
            disableDisclaimer: true,
        });

        if (signedTransaction.raw.senderType === Nimiq.Account.Type.BASIC) {
            throw new Error('You can only vote with basic accounts. Vesting and HTLC contracts are not allowed.');
        }

        const { sender, value } = signedTransaction.raw;
        this.vote = {
            vote,
            serialized,
            tx: { hash: signedTransaction.hash, sender, height, value },
            value: 0,
        };
        this.newlyVoted = true;

        await this.$nextTick();
        try {
            this.vote.value = (await this.client?.getAccount(sender))!.balance;
        } catch { /* not a problem if we miss the account balance */ }
        localStorage.vote = JSON.stringify(this.vote);
    }

    async countVotes(config = this.votingConfig!): Promise<ElectionResults> {
        if (!this.consensus) throw new Error('Consensus required but not established yet.');
        const client = this.client!;
        const height = await client.getHeadHeight();
        const end = Math.min(config.end, height);
        const votingAddress = await voteAddress(config, false);
        const addresses: string[] = [];
        const stats: any = {};
        let votes: CastVote<BaseVote>[] = [];
        let log = `Address: ${votingAddress}\nStart: ${config.start}\nEnd: ${end}\nCurrent height: ${height}\n\n`;

        await Vue.nextTick();

        console.log('counting votes: find all votes', config);
        const start = new Date().getTime();

        // Get all valid votes
        (await findTxBetween(votingAddress, config.start, end, testnet)).forEach((tx) => {
            console.log(JSON.stringify(tx, null, ' '));
            if (addresses.includes(tx.sender)) return; // only last vote countes
            try {
                // eslint-disable-next-line
                const { hash, sender, value, data, height } = tx;
                // Parse and check vote validity; throws if invalid
                const vote = parseVote(data, config);
                votes.push({
                    vote,
                    serialized: data,
                    tx: { hash, sender, value, height },
                    value: 0, // value of account, to be calculated
                });
                addresses.push(tx.sender);
            } catch { /* ignore malformatted votes and other, unrelated TX */ }
        });

        // Get balances and types of all accounts that voted, use chunking to avoid rate-limit
        const addressChunk = [];
        for (let i = 0; i < addresses.length; i += Nimiq.GetAccountsProofMessage.ADDRESSES_MAX_COUNT) {
            addressChunk.push(
                addresses.slice(i, Nimiq.GetAccountsProofMessage.ADDRESSES_MAX_COUNT),
            );
        }

        // Get accounts details in parallel for all chunks
        const balancesByAddress = new Map<string, number>();
        await Promise.all(addressChunk.map(async (chunk) => {
            const accounts = await client.getAccounts(chunk);
            accounts.forEach((account, i) => {
                const address = chunk[i];
                // Only keep BASIC accounts
                if (account.type === Nimiq.Account.Type.BASIC) {
                    balancesByAddress.set(address, account.balance);
                } else {
                    balancesByAddress.delete(address);
                }
            });
        }));

        // Remove votes from non-basic accounts, it's not allowed to vote with vesting or HTLC contracts
        votes = votes.filter((vote) => !balancesByAddress.has(vote.tx.sender));

        stats.votes = votes.length;
        log += `Counted votes:\n${JSON.stringify(votes, null, ' ')}\n\n`;
        console.log('counting votes: calculate balance', new Date().getTime() - start, addresses, votes);

        // Assign balances to votes
        for (const vote of votes) {
            const { sender } = vote.tx;
            vote.value = balancesByAddress.get(sender)!;
            if (height > config.end) {
                // After the vote ended, a balance can change. Therefore, we compute the balance of each address
                // at the end of the vote by tanking transactions and block rewards since then into account.

                // Get all transaction since the end of the vote, substract incoming and add outgoing
                (await findTxBetween(sender, end, height, testnet)).forEach((tx) => {
                    // Subtract all NIM that the address received after the vote ended
                    if (tx.recipient === sender) vote.value -= tx.value;
                    // Add all NIM that the address sent after the vote ended
                    if (tx.sender === sender) vote.value += tx.value + tx.fee;
                });

                // substract any NIM that were mined in the meantime
                (await blockRewardsSince(sender, end, testnet)).forEach((block) => {
                    vote.value -= block.reward + block.fees;
                });
            }
        }

        stats.nim = votes.reduce((sum, vote) => sum + vote.value, 0);

        const balances = votes.map((vote) => ({ address: vote.tx.sender, balance: vote.value }));
        log += `Balances at the last voting block:\n${JSON.stringify(balances, null, ' ')}\n\n`;
        console.log('counting votes: summarize', new Date().getTime() - start, votes);

        // Summarize votes
        const sums = new Map<string, number>(config.choices.map((choice) => [choice.name, 0]));
        const votesPerChoice = new Map<string, ElectionVote[]>(config.choices.map((choice) => [choice.name, []]));
        for (const vote of votes) {
            const totalWeight = voteTotalWeight(vote.vote.choices);
            for (const choice of vote.vote.choices) {
                if (!sums.has(choice.name)) continue; // Invalid choice

                // Calculate the weighted value of this choice
                const choiceValue = (choice.weight / totalWeight) * vote.value;

                // Add the value to the global sum of this choice
                const oldSum = sums.get(choice.name);
                const newSum = oldSum! + choiceValue;
                sums.set(choice.name, newSum);

                votesPerChoice.get(choice.name)!.push({
                    sender: vote.tx.sender,
                    height: vote.tx.height,
                    value: choiceValue,
                });
            }
        }

        log += `NIM per choice:\n${JSON.stringify(sums, null, ' ')}\n\n`;
        console.log('counting votes: return', new Date().getTime() - start, sums, votesPerChoice);

        // Format results
        const results = {
            label: config.label || config.name,
            results: config.choices.map((choice) => ({
                label: choice.label || choice.name,
                value: sums.get(choice.name)!,
                votes: votesPerChoice.get(choice.name)!,
            })).sort((a, b) => b.value - a.value), // highest first
            stats,
        };

        log += `Results:\n${JSON.stringify(results, null, ' ')}\n\n`;
        console.log(`Voting log\n\n${log}`);
        return results;
    }

    async showPreliminaryResults(config = this.votingConfig!) {
        if (!config) throw new Error('No on-going voting.');
        this.currentResults = null;
        this.resultsConfig = config;

        const height = await this.client!.getHeadHeight();
        if (this.resultHeight < height) {
            if (this.preliminaryResults) this.currentResults = this.preliminaryResults;
            this.resultHeight = height;
            this.$nextTick()
                .then(() => this.countVotes(config))
                .then((results) => {
                    this.preliminaryResults = results;
                    this.currentResults = results;
                });
        }

        this.currentResults = this.preliminaryResults;
        return this.currentResults;
    }

    async showFinalResults(config: Config) {
        this.currentResults = null;
        this.resultsConfig = config;
        try {
            this.currentResults = await loadResults(config);
        } catch (e) {
            this.currentResults = false;
        }
    }

    // Voting UI
    get type(): VoteTypes | undefined {
        return this.votingConfig?.type;
    }

    get totalWeight(): number {
        return voteTotalWeight(this.choices);
    }

    get canVote(): boolean {
        switch (this.votingConfig!.type) {
            case VoteTypes.singleChoice: return !!this.singleChoice;
            case VoteTypes.multipleChoice: return this.multipleChoices.length > 0;
            default: return true;
        }
    }

    get timeRemaining(): string {
        const blocks = this.votingConfig!.end - this.height;
        const days = Math.floor(blocks / (24 * 60));
        const hours = Math.floor((blocks - days * 24 * 60) / 60);
        const minutes = blocks - (days * 24 + hours) * 60;
        return days === 0 && hours === 0
            ? `${minutes} minutes`
            : days === 0
                ? `${hours} hours, ${minutes} min`
                : `${days} days, ${hours} hours`;
    }

    get voted(): boolean {
        return !!this.vote && this.votingConfig?.name === this.vote.vote.name;
    }

    get choicesStyle(): string {
        const choices = this.votingConfig!.choices.length;
        return `count-${choices} ${[2, 4].includes(choices) ? 'two' : 'three'} ${choices > 3 ? 'wrap' : ''} `;
    }

    // UI showing results
    readonly minBarItemSize = .375;
    get percentPerLuna(): number {
        return 100 / (this.currentResults as ElectionResults).stats.nim;
    }

    get barSizePerLuna(): number {
        return 100 / this.maxChoiceValue;
    }

    get maxVoteCount(): number {
        return (this.currentResults as ElectionResults).results
            .map((result) => result.votes.length)
            .reduce((a, b) => Math.max(a, b));
    }

    get maxChoiceValue(): number {
        return (this.currentResults as ElectionResults).results
            .map((result) => result.value)
            .reduce((a, b) => Math.max(a, b));
    }

    get isPreliminary(): boolean {
        return this.currentResults === this.preliminaryResults;
    }

    color(address: string): string {
        const index = stringHash(address) % this.colors.length;
        return this.colors[index];
    }
}
