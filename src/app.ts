import '@nimiq/style/nimiq-style.min.css';
import '@nimiq/vue-components/dist/NimiqVueComponents.css';
import { Component, Vue } from 'vue-property-decorator';
import HubApi from '@nimiq/hub-api';
import stringHash from 'string-hash';

import { loadNimiqCoreOnly, loadNimiqWithCryptography } from './lib/CoreLoader';
import { serializeVote, parseVote, voteTotalWeight, BaseVote, VoteTypes, BaseChoice } from './lib/votes';
import { loadConfig, Config } from './config';
import { findTxBetween, fetchJson, Tx, watchApi } from './lib/network';

const distinctColors = require('distinct-colors').default;

type Option = BaseChoice & {
    label: string,
}

type Receipt = {
    hash: string,
    vote: string,
}

type CastVote<T extends BaseVote> = {
    vote: T,
    tx: {
        sender: string,
        value: number,
        height: number,
    },
    value: number,
}

type ElectionVote = {
    sender: string,
    value: number,
    height: number,
}

type ElectionResult = {
    label: string,
    value: number,
    votes: ElectionVote[],
}

type ElectionResults = {
    label: string,
    results: ElectionResult[],
    stats: {
        votes: number,
        nim: number,
    },
}

Vue.mixin({
    created() {
        const enums: any = { VoteTypes };
        const target = this as any;
        for (const name of Object.keys(enums)) {
            target[name] = Object.freeze(enums[name]);
        }
    },
});

// const testnet = window.location.href.includes('localhost') || window.location.href.includes('testnet');
const testnet = false;
const dummies = true;
const debug = false;
const configAddress = `https://nimiq.community/voting.${testnet ? 'test' : 'live'}.json`;
const voteAddress = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000';
const appLogo = `${window.location.origin}/android-icon-192x192.png`;

@Component({ components: {} })
export default class App extends Vue {
    loading = true;
    choices: Option[] = [];
    configs: Array<Config> = [];
    config: Config | null = null; // active one
    singleChoice: string = '';
    multipleChoices: string[] = [];
    past: Array<Config> = [];
    client?: Nimiq.Client;
    consensus = false;
    height = 0;
    lastCounted = 0;
    testnet = testnet;
    debug = debug;
    dummies = dummies;
    private hub: HubApi = new HubApi(testnet ? 'https://hub.nimiq-testnet.com' : 'https://hub.nimiq.com');
    voted: Receipt | null = null;
    currentResults: ElectionResults | null = null;
    error = '';
    colors = distinctColors().map((color: any) => color.hex());

    async created() {
        (window as any).app = this;
        const start = new Date().getTime();

        // load config and block height
        console.log('creating');
        try {
            this.configs = await loadConfig(configAddress, dummies);
            this.height = (await watchApi('latest/1', testnet))[0].height;
        } catch (e) {
            if (!this.configs || !this.height) {
                console.log('Failed to load', this.configs, this.height, e);
                this.error = 'Something went wrong loading. Are you offline? Adblocker enabled? '
                             + `Maybe have a look and reload.\n\nReason: ${e}`;
                return;
            }
        }

        // parse config
        const { configs, height, choices } = this;
        console.log(configs, height);
        const activeConfigs = configs.filter((config) => config.start <= height && config.end > height);
        if (activeConfigs.length > 1) {
            throw new Error('Voting misconfigurated, more than one voting happing at the same time.');
        } else if (activeConfigs.length === 1) {
            [this.config] = activeConfigs;
            const { config } = this;
            if (config.choices) {
                for (const choice of config.choices) {
                    choices.push({
                        label: choice.label || choice.name,
                        name: choice.name,
                        weight: config.type === VoteTypes.weightedChoices ? 50 : 0,
                    });
                }
            } else throw new Error('No choices for this voting found.');
        }
        this.past = this.configs.filter((config) => config.end <= height);

        this.loading = false;

        console.log('loaded config', new Date().getTime() - start, this.height, this.config, this.choices);

        try {
            const Nimiq = await loadNimiqCoreOnly();
            await loadNimiqWithCryptography(!testnet);

            // initialize Nimiq
            if (!(Nimiq.GenesisConfig as any)._config) {
                if (testnet) Nimiq.GenesisConfig.test(); else Nimiq.GenesisConfig.main();
            }
            this.client = Nimiq.Client.Configuration.builder().instantiateClient();
            this.height = await this.client.getHeadHeight();
        } catch (e) {
            console.log(e);
            // if (e.message !== 'GenesisConfig already initialized') {
            if (!this.configs || !this.client || !this.height) {
                this.error = 'Something went wrong loading. Are you offline? Adblocker enabled? '
                             + `Maybe have a look and reload.\n\nReason: ${e}`;
                // window.document.location.reload();
                return;
            }
        }
        const { client } = this;

        client.addConsensusChangedListener((state) => {
            this.consensus = state === Nimiq.Client.ConsensusState.ESTABLISHED;
        });
        client.addHeadChangedListener(async () => {
            this.height = await client.getHeadHeight();
        });

        console.log('loaded Nimiq', new Date().getTime() - start, client);

        await client.waitForConsensusEstablished();
        if (this.config) await this.countPreliminaryVotes();

        console.log('counted votes', new Date().getTime() - start, JSON.stringify(this.currentResults, null, '  '));
    }

    serializeChoices(): BaseChoice[] {
        const { type } = this.config!;
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
            default: throw new Error(`Vote type "${type}" not implemented!`);
        }
    }

    async submitVote() {
        const { config, hub, height } = this;
        const vote = serializeVote({ name: config!.name, choices: this.serializeChoices() }, config!.type);
        console.log('Submitted vote:', vote);
        console.log('parsed', parseVote(vote, config!.type));

        const signedTransaction = await hub.checkout({
            appName: 'Nimiq Voting App',
            shopLogoUrl: appLogo,
            recipient: voteAddress,
            value: 1,
            extraData: vote,
            validityDuration: Math.min(120, config!.end - height),
        });

        this.voted = {
            hash: signedTransaction.hash,
            vote,
        };
    }

    async countVotes(config = this.config!): Promise<ElectionResults> {
        const client = this.client!;
        const height = await client.getHeadHeight();
        const end = Math.min(config.end, height);
        const address = voteAddress.replace(' ', '');
        const votes: CastVote<BaseVote>[] = [];
        const addresses: string[] = [];
        const stats: any = {};

        if (height === this.lastCounted) throw new Error(`Counted block height ${height} already.`);
        this.lastCounted = height;

        console.log('counting votes: find all votes', config);
        const start = new Date().getTime();

        // find all votes
        (await findTxBetween(address, config.start, end, testnet)).forEach((tx) => {
            if (addresses.includes(tx.sender)) return; // ignore older ones
            try {
                const { data, sender, value, height } = tx;
                const vote = parseVote(data, config.type);
                if (vote.name === config.name) {
                    votes.push({ vote, tx: { sender, value, height }, value: 0 });
                    addresses.push(tx.sender);
                }
                console.log('tx', tx, vote);
            } catch { /* ignore malformatted votes and other, unrelated TX */ }
        });

        stats.votes = votes.length;
        console.log('counting votes: calculate balance', new Date().getTime() - start, addresses, votes);

        // calculate account balance at config.end height and store it in vote.value
        for (const vote of votes) {
            const { sender } = vote.tx;
            vote.value = (await client.getAccount(sender))?.balance;
            if (height > config.end) {
                (await findTxBetween(sender, end, height, testnet)).forEach((tx) => {
                    if (tx.recipient === sender) vote.value -= tx.value;
                    if (tx.sender === sender) vote.value += tx.value;
                });
            }
        }

        stats.nim = votes.map((v) => v.value).reduce((v1, v2) => v1 + v2, 0);
        console.log('counting votes: summarize', new Date().getTime() - start, votes);

        // summarize votes
        const sum = new Map<string, number>(config.choices.map((choice) => [choice.name, 0]));
        const votesPerChoice = new Map<string, ElectionVote[]>(config.choices.map((choice) => [choice.name, []]));
        for (const vote of votes) {
            console.log(vote);
            const total = voteTotalWeight(vote.vote.choices);
            for (const choice of vote.vote.choices) {
                const old = sum.get(choice.name);
                if (old !== undefined) { // a choice that is not configured
                    console.log(choice.name, old + (choice.weight / total) * vote.value, choice.weight, vote.value);
                    const value = (choice.weight / total) * vote.value;
                    sum.set(choice.name, old + value);
                    votesPerChoice.get(choice.name)!.push({ sender: vote.tx.sender, height: vote.tx.height, value });
                }
            }
        }

        console.log('counting votes: return', new Date().getTime() - start, sum, votesPerChoice);

        // format result
        return {
            label: config.label || config.name,
            results: config.choices.map((choice) => ({
                label: choice.label || choice.name,
                value: sum.get(choice.name)!,
                votes: votesPerChoice.get(choice.name)!,
            })).sort((a, b) => b.value - a.value), // highest first
            stats,
        };
    }

    async countPreliminaryVotes() {
        this.currentResults = await this.countVotes(this.config!);
    }

    // voting
    get type(): VoteTypes | undefined {
        return this.config?.type;
    }

    get totalWeight(): number {
        return voteTotalWeight(this.choices);
    }

    get canVote(): boolean {
        switch (this.config!.type) {
            case VoteTypes.singleChoice: return !!this.singleChoice;
            case VoteTypes.multipleChoice: return this.multipleChoices.length > 0;
            default: return true;
        }
    }

    // current results
    get pixelPerNIM(): number {
        return this.maxWidth / this.maxChoiceValue;
    }

    get maxWidth(): number {
        console.log('maxWidth', this.$refs);
        const maxVotes = this.currentResults!.results.map((result) => result.votes.length).sort((a, b) => b - a)[0];
        return (this.$refs.results as HTMLElement)?.offsetWidth - 70 - maxVotes * 2;
    }

    get maxChoiceValue(): number {
        return this.currentResults!.results.map((result) => result.value).sort((a, b) => b - a)[0];
    }

    color(address: string): string {
        const index = stringHash(address) % this.colors.length;
        return this.colors[index];
    }
}
