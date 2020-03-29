import '@nimiq/style/nimiq-style.min.css';
import '@nimiq/vue-components/dist/NimiqVueComponents.css';
import { Component, Vue } from 'vue-property-decorator';
import Nimiq, { Client, ClientTransactionDetails, BufferUtils } from '@nimiq/core-web';
import HubApi from '@nimiq/hub-api';

// import { loadNimiqWithCryptography } from './lib/CoreLoader';
import { YesNo, serializeVote, VoteTypes, WeightedChoice, parseVote, YesNoVote, BaseVote, MultipleChoiceVote,
    WeightedCoicesVote, voteTotalWeight } from './lib/votes';
import { loadConfig, Config } from './config';

// type Nimiq = typeof import('@nimiq/core-web');
// type Client = import('@nimiq/core-web').Client;

type Option = WeightedChoice & {
    label: string,
}

type Receipt = {
    hash: string,
    vote: string,
}

type CastVote<T extends BaseVote> = {
    vote: T,
    value: number,
}

type ElectionResult = {
    label: string,
    value: number,
}

type ElectionResults = {
    label: string,
    results: ElectionResult[],
}

Vue.mixin({
    created() {
        const enums: any = { VoteTypes };
        const target = this as any;
        console.log('created', target);
        for (const name of Object.keys(enums)) {
            target[name] = Object.freeze(enums[name]);
        }
    },
});

// const test = window.location.href.includes('localhost') || window.location.href.includes('testnet');
const test = false;
const configAddress = `https://nimiq.community/voting.${test ? 'test' : 'live'}.json`;
const voteAddress = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000';
const appLogo = `${window.location.origin}/android-icon-192x192.png`;
const wasmUrl = `${window.location.origin}/wasm/`;

@Component({ components: {} })
export default class App extends Vue {
    loading = true;
    yesVote = false;
    choices = [];
    options: Option[] = [];
    configs: Array<Config> = [];
    config: Config | null = null; // active one
    past: Array<Config> = [];
    // nimiq: Nimiq | null = null;
    client?: Client;
    consensus = false;
    height = 0;
    test = test;
    private hub: HubApi = new HubApi(test ? 'https://hub.nimiq-testnet.com' : 'https://hub.nimiq.com');
    // {"hash":"hash","vote":"v"}
    voted: Receipt | null = null;
    currentResults: ElectionResults | null = null;
    // voted: Receipt | null = { hash: 'hash', vote: 'v' };

    created() {
        // (this as any).VoteTypes = Object.freeze(VoteTypes);
        console.log('created', new Date().getMilliseconds());
    }

    async mounted() {
        console.log('mounted 1', new Date().getMilliseconds());
        // [this.configs,this.nimiq] = await Promise.all([loadConfig(configAddress), loadNimiqWithCryptography(!test)]);
        // this.client = this.nimiq.Client.Configuration.builder().instantiateClient();
        try {
            this.configs = await loadConfig(configAddress);

            // initialize Nimiq

            console.log((Nimiq.GenesisConfig as any)._config, !(Nimiq.GenesisConfig as any)._config);
            if (!(Nimiq.GenesisConfig as any)._config) {
                await Nimiq.load(wasmUrl);
                if (test) Nimiq.GenesisConfig.test(); else Nimiq.GenesisConfig.main();
            }
            this.client = Nimiq.Client.Configuration.builder().instantiateClient();
            this.height = await this.client.getHeadHeight();
        } catch (e) {
            console.log(e);
            // if (e.message !== 'GenesisConfig already initialized') {
            if (!this.configs || !this.client || !this.height) {
                alert(`Something went wrong loading. Are you offline? Adblocker enabled? Maybe have a look and reload.
                       \nReason: ${e}`);
                // window.document.location.reload();
                return;
            }
        }
        const { client, height } = this;

        client.addConsensusChangedListener((state) => {
            this.consensus = state === Nimiq.Client.ConsensusState.ESTABLISHED;
        });
        client.addHeadChangedListener(async () => {
            this.height = await client.getHeadHeight();
        });

        const activeConfigs = this.configs.filter((config) => config.start >= height && config.end > height);
        if (activeConfigs.length > 1) {
            throw new Error('Voting misconfigurated, more than one voting happing at the same time.');
        } else if (activeConfigs.length === 1) {
            [this.config] = activeConfigs;
            if (this.config.options) {
                for (const option of this.config.options) {
                    this.options.push({
                        label: option.label || option.name,
                        name: option.name,
                        weight: 50,
                    });
                }
            }
        }

        this.past = this.configs.filter((config) => config.end <= height);

        console.log('mounted 2', new Date().getMilliseconds(), JSON.stringify(this.options));
        console.log(this.config);

        this.loading = false;

        await client.waitForConsensusEstablished();
        if (this.config) {
            this.currentResults = await this.countVotes(this.config);
        }
    }

    serializeVote(): string {
        const { name, type } = this.config!;

        switch (type) {
            case VoteTypes.yesNo: {
                const answer = this.yesVote ? YesNo.yes : YesNo.no;
                return serializeVote({ name, answer }, VoteTypes.yesNo);
            }
            case VoteTypes.multipleChoice: {
                const choices = this.options
                    .filter((option) => option.weight > 0)
                    .map((option) => option.name);
                return serializeVote({ name, choices }, VoteTypes.multipleChoice);
            }
            case VoteTypes.weightedChoices: {
                const choices = this.options.filter((option) => option.weight > 0);
                return serializeVote({ name, choices }, VoteTypes.weightedChoices);
            }
            default: throw new Error(`Vote type "${type}" not implemented!`);
        }
    }

    async submitVote() {
        const vote = this.serializeVote();
        console.log('Submitted vote:', vote);
        console.log('parsed', parseVote(vote, this.config!.type));

        const signedTransaction = await this.hub.checkout({
            appName: 'Nimiq Voting App',
            shopLogoUrl: appLogo,
            recipient: voteAddress,
            value: 1,
            extraData: vote,
            validityDuration: Math.min(120, this.config!.end - this.height),
        });

        // {"hash":"hash","vote":"v"}
        this.voted = {
            hash: signedTransaction.hash,
            vote,
        };
    }

    sumUpElectionResults(votes: CastVote<BaseVote>[], config: Config) {
        function create(options: string[]) { return Object.fromEntries(options.map((option) => [option, 0])); }
        switch (config.type) {
            case VoteTypes.yesNo: {
                const total = create([YesNo.yes, YesNo.no]);
                for (const vote of votes as CastVote<YesNoVote>[]) {
                    total[vote.vote.answer] += vote.value;
                    // Next version with details should include:
                    // total + for each vote: value, height, address
                }
                return total;
            }
            case VoteTypes.multipleChoice: {
                const total = create(config.options!.map((option) => option.name));
                for (const vote of votes as CastVote<MultipleChoiceVote>[]) {
                    for (const choice of vote.vote.choices) total[choice] += vote.value;
                }
                return total;
            }
            case VoteTypes.weightedChoices: {
                const total = create(config.options!.map((option) => option.name));
                for (const vote of votes as CastVote<WeightedCoicesVote>[]) {
                    const totalWeight = voteTotalWeight(vote.vote.choices);
                    for (const choice of vote.vote.choices) {
                        total[choice.name] += (choice.weight / totalWeight) * vote.value;
                    }
                }
                return total;
            }
            default: throw new Error(`Type "${config.type} is not implemented!"`);
        }
    }

    async countVotes(config = this.config!): Promise<ElectionResults> {
        const txs = await this.client?.getTransactionsByAddress(voteAddress, config?.start);

        const decoder = new TextDecoder();
        const votes: CastVote<BaseVote>[] = [];
        txs!.forEach((tx: ClientTransactionDetails) => {
            try {
                const serialized = decoder.decode(tx.data.raw);
                const vote = parseVote(serialized, config.type);
                const { value } = tx;
                console.log('Parsed TX', tx.transactionHash, serialized, vote);
                if (vote.name === config.name) votes.push({ vote, value });
            } catch { /* ignore malformatted votes */ }
        });

        const total = this.sumUpElectionResults(votes, config);

        if (config.type === VoteTypes.yesNo) {
            return {
                label: config.label || config.name,
                results: [{
                    label: 'Yes / Agree',
                    value: total[YesNo.yes],
                }, {
                    label: 'No / Disagree',
                    value: total[YesNo.no],
                }],
            };
        }
        const results: ElectionResult[] = config.options!.map((choice) => ({
            label: choice.label || choice.name,
            value: total[choice.name],
        }));
        return {
            label: config.label || config.name,
            results,
        };
    }

    get type(): VoteTypes | undefined {
        return this.config?.type;
    }

    get totalWeight(): number {
        return voteTotalWeight(this.options);
    }
}
