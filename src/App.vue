<script setup lang="ts">
import type {
    BaseChoice,
    BaseVote,
    CastVote,
    Config,
    ElectionResult,
    ElectionResults,
    ElectionStats,
    ElectionVote,
    Option,
} from './lib/types';
import * as Nimiq from '@nimiq/core';
import HubApi from '@nimiq/hub-api';
import { CloseIcon, InfoCircleSmallIcon, Tooltip } from '@nimiq/vue3-components';
import distinctColors from 'distinct-colors';
import stringHash from 'string-hash';
import { computed, nextTick, onMounted, ref, watch } from 'vue';

import draggable from 'vuedraggable';
import { contactInfo, debug, dummies, testnet } from './lib/const';
import { loadConfig, loadResults } from './lib/data';
import { findTxBetween, stakerRewardsSince, validatorRewardsSince, watchApi } from './lib/network';
import { VoteTypes } from './lib/types';
import { blockDate as blockDateUtil, blocksToSeconds } from './lib/util';
import { parseVote, serializeVote, voteAddresses, voteTotalWeight } from './lib/votes';

import '@nimiq/style/nimiq-style.min.css';
import '@nimiq/vue3-components/css';

type AppError = {
    message: string,
    solution: string,
    reason: string,
};

const appLogo = `${window.location.origin}/android-icon-192x192.png`;
const maxVotesInGraph = 10;

// State
const loading = ref(true);
const currentError = ref<AppError | null>(null);
const configs = ref<Config[]>([]);

const votingConfig = ref<Config | null>(null);
const votingAddress = ref<string | null>(null);
const votingAddresses = ref<string[] | null>(null);
const hub = new HubApi(testnet ? 'https://hub.nimiq-testnet.com' : 'https://hub.nimiq.com');
function loadStoredVote(): CastVote | null {
    try {
        return localStorage.vote
            ? JSON.parse(localStorage.vote)
            : null;
    } catch {
        return null;
    }
}
const vote = ref<CastVote | null>(loadStoredVote());
const newlyVoted = ref(false);
const errorVoting = ref('');

const choices = ref<Option[]>([]);
const singleChoice = ref('');
const multipleChoices = ref<string[]>([]);
const drag = ref(false);

const client = ref<Nimiq.Client>();
const consensus = ref(false);
const height = ref(0);

const pastVotings = ref<Config[]>([]);
const countingStatus = ref('');
const upcomingVotings = ref<Config[]>([]);
const nextVoting = ref<Config | null>(null);

const resultHeight = ref(0);
const resultsConfig = ref<Config | null>(null);
const resultsAddresses = ref<string[] | null>(null);
const currentResults = ref<ElectionResults | false | null>(null);
const preliminaryResults = ref<ElectionResults | null>(null);
const colors = ref<string[]>([]);

// Error handler
function error(message: string, reason: Error | string, solution: string = contactInfo): never {
    const reasonStr = reason.toString();
    currentError.value = { message, reason: reasonStr, solution };
    throw new Error(`${message}: ${reasonStr}`);
}

// Computed properties
const type = computed(() => votingConfig.value?.type);

const totalWeight = computed(() => voteTotalWeight(choices.value));

const canVote = computed(() => {
    switch (votingConfig.value?.type) {
        case VoteTypes.singleChoice: return !!singleChoice.value;
        case VoteTypes.multipleChoice: return multipleChoices.value.length > 0;
        default: return true;
    }
});

const timeRemaining = computed(() => {
    if (!votingConfig.value)
        return '';
    const seconds = blocksToSeconds(votingConfig.value.end - height.value);
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds - days * 24 * 60 * 60) / (60 * 60));
    const minutes = Math.floor((seconds - (days * 24 * 60 * 60 + hours * 60 * 60)) / 60);
    if (days === 0 && hours === 0)
        return `${minutes} minutes`;
    if (days === 0)
        return `${hours} hours, ${minutes} min`;
    return `${days} days, ${hours} hours`;
});

const voted = computed(() => !!vote.value && votingConfig.value?.name === vote.value.vote.name);

const choicesStyle = computed(() => {
    if (!votingConfig.value)
        return '';
    const count = votingConfig.value.choices.length;
    return `count-${count} ${[2, 4].includes(count) ? 'two' : 'three'} ${count > 3 ? 'wrap' : ''}`.trim();
});

// Results computed
const minBarItemSize = 0.375;

const electionResults = computed(() => currentResults.value as ElectionResults);

const percentPerLuna = computed(() => 100 / electionResults.value.stats.luna);

const maxChoiceValue = computed(() => {
    return electionResults.value.results
        .map((result) => result.value)
        .reduce((a, b) => Math.max(a, b));
});

const barSizePerLuna = computed(() => 100 / maxChoiceValue.value);

const maxVoteCount = computed(() => {
    return electionResults.value.results
        .map((result) => result.votes.length)
        .reduce((a, b) => Math.max(a, b));
});

const isPreliminary = computed(() => currentResults.value === preliminaryResults.value);

// Watch for results to make colors
watch(currentResults, () => {
    if (!currentResults.value)
        return;
    const colorCount = Math.min(electionResults.value.stats.votes * 2, 100);
    colors.value = distinctColors({
        count: colorCount,
        lightMin: 65,
        lightMax: 80,
        chromaMin: 40,
        chromaMax: 50,
    }).map((color: { hex: () => string }) => color.hex());
});

// Methods
function serializeChoices(): BaseChoice[] {
    const configType = votingConfig.value!.type;
    switch (configType) {
        case VoteTypes.singleChoice:
            return [{ name: singleChoice.value, weight: 1 }];
        case VoteTypes.multipleChoice: {
            return multipleChoices.value
                .map((choice) => ({ name: choice, weight: 1 }));
        }
        case VoteTypes.weightedChoices: {
            const total = voteTotalWeight(choices.value);
            return choices.value.map((choice) => ({
                name: choice.name,
                weight: (choice.weight / total) * 100,
            }));
        }
        case VoteTypes.ranking: {
            return choices.value.map((choice) => ({ name: choice.name, weight: 1 }));
        }
        default: throw new Error(`Vote type "${configType}" not implemented!`);
    }
}

async function trySubmittingVote() {
    try {
        await submitVote();
    } catch (err) {
        errorVoting.value = err instanceof Error ? err.message : String(err);
    }
}

async function submitVote() {
    const config = votingConfig.value;
    const voteData: BaseVote = { name: config!.name, choices: serializeChoices() };
    console.log(JSON.stringify(voteData));
    const serialized = serializeVote(voteData, config!.type);
    // parsing again is the sanity check of the serialization
    console.log('Submitted vote:', serialized, parseVote(serialized, config!));

    const signedTransaction = await hub.checkout({
        appName: 'Nimiq Vote',
        shopLogoUrl: appLogo,
        recipient: votingAddress.value!,
        value: 1,
        extraData: serialized,
        validityDuration: Math.min(120, config!.end - height.value),
        disableDisclaimer: true,
    });

    if (signedTransaction.raw.senderType !== Nimiq.AccountType.Basic) {
        throw new Error('You can only vote with basic accounts. Vesting and HTLC contracts are not allowed.');
    }

    const { sender, value: txValue } = signedTransaction.raw;
    vote.value = {
        vote: voteData,
        serialized,
        tx: { hash: signedTransaction.hash, sender, height: height.value, value: txValue },
        value: 0,
    };
    newlyVoted.value = true;

    await nextTick();
    try {
        const [account, staker] = await Promise.all([
            client.value?.getAccount(sender),
            client.value?.getStaker(sender),
        ]);

        const accountBalance = account?.balance || 0;
        const stakerBalance = staker ? staker.balance + staker.inactiveBalance + staker.retiredBalance : 0;

        vote.value.value = accountBalance + stakerBalance;
        showPreliminaryResults(); // Refresh
    } catch { /* not a problem if we miss the account balance */ }
    localStorage.vote = JSON.stringify(vote.value);
}

async function countVotes(config = votingConfig.value!): Promise<ElectionResults> {
    if (!consensus.value)
        throw new Error('Consensus required but not established yet.');
    const nimiqClient = client.value!;
    const currentHeight = await nimiqClient.getHeadHeight();
    const end = Math.min(config.end, currentHeight);
    const votingAddrs = await voteAddresses(config, false);
    const stats: ElectionStats = { votes: 0, luna: 0 };
    let votes: CastVote<BaseVote>[] = [];
    let log = `Addresses: ${votingAddrs}\nStart: ${config.start}\nEnd: ${config.end}\nHeight: ${currentHeight}\n\n`;

    await nextTick();

    console.debug('counting votes: find all votes', config);
    const start = new Date().getTime();

    // Get all valid votes
    countingStatus.value = 'Loading all transactions';
    const addresses: string[] = [];
    (await findTxBetween(votingAddrs, config.start, end, testnet)).forEach((tx) => {
        console.debug(JSON.stringify(tx, null, ' '));
        if (addresses.includes(tx.sender))
            return; // only last vote counts
        try {
            const { hash, sender, value: txValue, data, height: txHeight } = tx;
            // Parse and check vote validity; throws if invalid
            const parsedVote = parseVote(data, config);
            votes.push({
                vote: parsedVote,
                serialized: data,
                tx: { hash, sender, value: txValue, height: txHeight },
                value: 0, // value of account, to be calculated
            });
            addresses.push(tx.sender);
        } catch { /* ignore malformatted votes and other, unrelated TX */ }
    });

    // Get balances and types of all accounts that voted, use chunking to avoid rate-limit
    countingStatus.value = 'Loading accounts';
    const addressChunk = [];
    // Request a maximum of 255 addresses at once (`RequestTrieProof::MAX_KEYS`)
    for (let i = 0; i < addresses.length; i += 255) {
        addressChunk.push(
            addresses.slice(i, i + 255),
        );
    }

    // Get accounts details in parallel for all chunks
    const balancesByAddress = new Map<string, number>();
    try {
        await Promise.all(addressChunk.map(async (chunk) => {
            const accounts = await nimiqClient.getAccounts(chunk);
            accounts.forEach((account, i) => {
                const address = chunk[i];
                // Only keep BASIC accounts
                if (account.type === 'basic') {
                    balancesByAddress.set(address, account.balance);
                } else {
                    balancesByAddress.delete(address);
                }
            });
        }));
    } catch (e) {
        error('Failed to get account balances when counting votes', e as Error, 'Try reloading.');
    }
    try {
        await Promise.all(addressChunk.map(async (chunk) => {
            const stakers = await nimiqClient.getStakers(chunk);
            stakers.forEach((staker, i) => {
                if (!staker)
                    return;

                const address = chunk[i];
                // Only update accounts that have not been filtered out already
                const balance = balancesByAddress.get(address);
                if (balance !== undefined) {
                    balancesByAddress.set(
                        address,
                        balance
                        + staker.balance
                        + staker.inactiveBalance
                        + staker.retiredBalance,
                    );
                }
            });
        }));
    } catch (e) {
        error('Failed to get account balances when counting votes', e as Error, 'Try reloading.');
    }

    // Remove votes from non-basic accounts, it's not allowed to vote with vesting or HTLC contracts
    votes = votes.filter((v) => balancesByAddress.has(v.tx.sender));

    stats.votes = votes.length;
    log += `Counted votes:\n${JSON.stringify(votes, null, ' ')}\n\n`;
    console.debug('counting votes: calculate balance', new Date().getTime() - start, addresses, votes);

    // Assign balances to votes
    for (let index = 0; index < votes.length; index++) {
        countingStatus.value = `Calculating balances ${index + 1} of ${votes.length}`;
        const v = votes[index];
        const { sender } = v.tx;
        v.value = balancesByAddress.get(sender)!;
        if (currentHeight > config.end) {
            // After the vote ended, a balance can change. Therefore, we compute the balance of each address
            // at the end of the vote by taking transactions and block rewards since then into account.

            // Get all transaction since the end of the vote, subtract incoming and add outgoing
            const txs = await findTxBetween([sender], end, currentHeight, testnet);
            for (const tx of txs) {
                // Subtract all NIM that the address received after the vote ended
                if (tx.recipient === sender)
                    v.value -= tx.value;
                // Add all NIM that the address sent after the vote ended
                if (tx.sender === sender)
                    v.value += tx.value + tx.fee;
            }

            // subtract any NIM that were mined in the meantime
            const validatorRewards = await validatorRewardsSince(sender, end, testnet);
            const stakerRewards = await stakerRewardsSince(sender, end, currentHeight, testnet);
            for (const { reward } of validatorRewards) {
                v.value -= reward;
            }
            for (const { reward } of stakerRewards) {
                v.value -= reward;
            }
        }
    }

    stats.luna = votes.reduce((sum, v) => sum + v.value, 0);

    const balances = votes.map((v) => ({ address: v.tx.sender, balance: v.value }));
    log += `Balances at the last voting block:\n${JSON.stringify(balances, null, ' ')}\n\n`;
    console.debug('counting votes: summarize', new Date().getTime() - start, votes);

    // Summarize votes
    const sums = new Map<string, number>(config.choices.map((choice) => [choice.name, 0]));
    const votesPerChoice = new Map<string, ElectionVote[]>(config.choices.map((choice) => [choice.name, []]));
    for (const v of votes) {
        const voteWeight = voteTotalWeight(v.vote.choices);
        for (const choice of v.vote.choices) {
            if (!sums.has(choice.name)) {
                console.error('Invalid choice', v, choice);
                continue; // Invalid choice, should not happen, means malformatted vote was parsed w/t error
            }

            // Calculate the weighted value of this choice
            const choiceValue = (choice.weight / voteWeight) * v.value;

            // Add the value to the global sum of this choice
            const oldSum = sums.get(choice.name);
            const newSum = oldSum! + choiceValue;
            sums.set(choice.name, newSum);

            votesPerChoice.get(choice.name)!.push({
                sender: v.tx.sender,
                height: v.tx.height,
                value: choiceValue,
            });
        }
    }

    log += `NIM per choice:\n${JSON.stringify(sums, null, ' ')}\n\n`;
    console.debug('counting votes: return', new Date().getTime() - start, sums, votesPerChoice);

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

    console.debug(`Voting log\n\n${log}\n\nResults:`);
    console.debug(JSON.stringify(results, null, ' '));
    countingStatus.value = '';
    return results;
}

async function showPreliminaryResults(config = votingConfig.value!) {
    if (!config)
        throw new Error('No on-going voting.');
    currentResults.value = null;
    resultsConfig.value = config;
    resultsAddresses.value = await voteAddresses(config, true);

    const currentHeight = await client.value!.getHeadHeight();
    if (resultHeight.value < currentHeight) {
        if (preliminaryResults.value)
            currentResults.value = preliminaryResults.value;
        resultHeight.value = currentHeight;
        nextTick()
            .then(() => countVotes(config))
            .then((results) => {
                preliminaryResults.value = results;
                currentResults.value = results;
            })
            .catch((e) => console.error('Failed to count votes:', e));
    }

    currentResults.value = preliminaryResults.value;
    return currentResults.value;
}

async function showFinalResults(config: Config) {
    currentResults.value = null;
    resultsConfig.value = config;
    resultsAddresses.value = await voteAddresses(config, true);
    try {
        currentResults.value = await loadResults(config);
    } catch {
        currentResults.value = false;
    }
}

function topVotes(result: ElectionResult): ElectionVote[] {
    return result.votes.slice()
        .sort((a, b) => b.value - a.value) // highest value first
        .slice(0, maxVotesInGraph) // top x votes
        .sort((a, b) => b.height - a.height); // latest first
}

function otherVotesValue(result: ElectionResult): number {
    const topVotesTotalValue = topVotes(result).reduce((sum, v) => sum + v.value, 0);
    return result.value - topVotesTotalValue;
}

function formatLunaAsNim(luna: number): string {
    const nim = Math.round(luna / 100000).toFixed(0);
    return `${nim.replace(/\B(?=(\d{3})+(?!\d))/g, '\'').trim()} NIM`;
}

function color(address: string): string {
    const index = stringHash(address) % colors.value.length;
    return colors.value[index];
}

function blockDate(block: number): string {
    const date = blockDateUtil(block, height.value);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        timeZone: 'UTC',
        timeZoneName: 'short',
        hourCycle: 'h23',
    });
}

function formatPosition(position: number): string {
    switch (position) {
        case 1: return '1st';
        case 2: return '2nd';
        case 3: return '3rd';
        default: return `${position}th`;
    }
}

function clearVote() {
    vote.value = null;
}

function clearNextVoting() {
    nextVoting.value = null;
}

function clearErrorVoting() {
    errorVoting.value = '';
}

// Lifecycle
onMounted(async () => {
    (window as Window & { app?: unknown }).app = { vote, configs, currentResults };
    const start = new Date().getTime();
    const configName = window.location.hash.replace('#', '');
    // Load config and block height.
    console.log('Loading voting app');
    try {
        configs.value = await loadConfig();
        height.value = (await watchApi('api/v1/latest/1', testnet))[0].height;
    } catch (e) {
        if (!configs.value || !height.value) {
            console.log('Loading voting app: Loading configuration failed', configs.value, height.value, e);
            error(
                'Something went wrong loading the configuration files.',
                e as Error,
                'Are you offline? Adblocker enabled? Maybe have a look and reload.',
            );
        }
    }

    console.log('Loading voting app: Loaded config', new Date().getTime() - start, height.value, configs.value);

    // Parse config and find current voting.
    // If name is given, only consider the config with that name
    const configList = configName ? configs.value.filter((config) => config.name === configName) : configs.value;
    const activeConfigs = configList.filter((config) => config.start <= height.value && config.end > height.value);

    if (activeConfigs.length > 1) {
        error('Voting misconfigured.', 'More than one active voting is not permitted.');
    }
    if (activeConfigs.length === 1) {
        const [config] = activeConfigs;
        if (config.choices.length < 1) {
            error('Voting misconfigured.', 'No choices configured.');
        }
        for (const choice of config.choices) {
            let weight = 1;
            if (config.type === VoteTypes.weightedChoices)
                weight = 50;
            else if (config.type === VoteTypes.ranking)
                weight = Math.random();

            choices.value.push({
                label: choice.label || choice.name,
                name: choice.name,
                weight,
            });
        }

        if (config.type === VoteTypes.ranking) {
            choices.value = choices.value.sort((a, b) => b.weight - a.weight);
        }

        // config for current voting loaded
        votingConfig.value = config;
        votingAddresses.value = await voteAddresses(votingConfig.value, true);
        votingAddress.value = votingAddresses.value[0];
    }

    // Find past votings
    pastVotings.value = configList
        .filter((config) => config.end <= height.value)
        .sort((a, b) => b.end - a.end); // latest first
    const [latestVoting] = pastVotings.value;
    if (!votingConfig.value && latestVoting) {
    // No voting right now, try loading latest results
        await showFinalResults(latestVoting);
    }

    // Find upcoming votings
    upcomingVotings.value = configList
        .filter((config) => config.start > height.value)
        .sort((a, b) => a.start - b.start); // closest first
    nextVoting.value = upcomingVotings.value[0] || null;

    // Essential loading completed, update UI and load Nimiq lib in the background
    console.log(
        'Loading voting app: Parsed config',
        new Date().getTime() - start,
        choices.value,
        votingAddresses.value,
    );
    loading.value = false;
    await nextTick();

    try {
        const config = new Nimiq.ClientConfiguration();
        if (testnet) {
            config.network('TestAlbatross');
            config.seedNodes([
                '/dns4/seed1.pos.nimiq-testnet.com/tcp/8443/wss',
                '/dns4/seed2.pos.nimiq-testnet.com/tcp/8443/wss',
                '/dns4/seed3.pos.nimiq-testnet.com/tcp/8443/wss',
                '/dns4/seed4.pos.nimiq-testnet.com/tcp/8443/wss',
            ]);
        }
        client.value = await Nimiq.Client.create(config.build());
    } catch (e) {
        if (!client.value) {
            error(
                'Something went wrong loading the Nimiq API.',
                e as Error,
                'Are you offline? Adblocker enabled? Maybe have a look and reload.',
            );
        }
    }

    const nimiqClient = client.value!;
    nimiqClient.addConsensusChangedListener((state) => {
        consensus.value = state === 'established';
    });
    nimiqClient.addHeadChangedListener(async () => {
        height.value = await nimiqClient.getHeadHeight();
        console.debug('Head change: current height', height.value);
        if (votingConfig.value?.end === height.value) {
            // When the vote has just ended, print the results to console
            const results = await showPreliminaryResults();
            console.debug(`Voting results for ${votingConfig.value.name}:`);
            console.debug(JSON.stringify(results));
            console.debug(results);
        }
    });

    // Loading Nimiq completed, update UI and wait for consensus and load results in background
    console.log('Loading voting app: Loaded Nimiq', new Date().getTime() - start, nimiqClient);
    await nextTick();
    await nimiqClient.waitForConsensusEstablished();

    // No voting and no final results > show preliminary results
    if (!votingConfig.value && latestVoting && !currentResults.value) {
        showPreliminaryResults(latestVoting);
    } else if (votingConfig.value && !currentResults.value) {
    // Voting is taking place; loading results in the background so the user doesn't have to wait after voting
        await showPreliminaryResults();
    }

    console.log(
        'Loading voting app: Counted votes',
        new Date().getTime() - start,
        JSON.stringify(currentResults.value, null, '  '),
    );
});
</script>

<template>
  <div v-if="currentError" id="app" class="error">
    <h1>Oh oh, an error occurred!</h1>
    <p class="message">
      {{ currentError.message }}
    </p>
    <p class="solution">
      {{ currentError.solution }}
    </p>
    <p class="reason">
      {{ currentError.reason }}
    </p>
  </div>
  <div v-else-if="loading" id="app" class="loading">
    loading...
  </div>
  <div v-else id="app">
    <div v-if="debug" class="debugging">
      <h2>Debugging</h2>
      <div>testnet {{ testnet }}, debug {{ debug }}, dummies {{ dummies }}</div>
      <div>Loading {{ loading }}</div>
      <div>height {{ height }}, consensus {{ consensus }}</div>
      <hr>
      <div>type {{ type }}, #configs {{ configs.length }}</div>
      <div>voted {{ voted }}, newlyVoted {{ newlyVoted }}</div>
      <div>vote {{ vote }}</div>
      <div>votingAddresses {{ votingAddresses?.join(', ') }}</div>
      <div>votingConfig {{ votingConfig }}</div>
      <div>choices {{ choices }}</div>
      <hr>
      <div>resultsConfig {{ resultsConfig }}</div>
      <div>results {{ currentResults }}</div>
    </div>

    <!-- currently no voting -->
    <div v-if="!votingConfig && !currentResults" class="nq-card no voting">
      <div class="nq-card-header">
        <h1>Hello there!</h1>
        <p class="sub">
          No voting is currently open.
        </p>
      </div>

      <div class="nq-card-body">
        <p>No voting is taking place at this moment.</p>
        <p>
          To stay up-to-date about votings and Nimiq in general, follow us on
          <a class="nq-link" href="https://twitter.com/nimiq">Twitter</a>
          or join us on
          <a class="nq-link" href="https://t.me/nimiq">Telegram</a>
          and
          <a class="nq-link" href="https://www.nimiq.com/community/">many more social channels</a>.
          Looking forward to seeing you there!
        </p>
        <p v-if="pastVotings.length">
          Counting latest results: {{ countingStatus ? countingStatus : 'Initializing' }}...
        </p>
      </div>
    </div>

    <!-- upcoming vote -->
    <div v-else-if="!votingConfig && nextVoting" class="nq-card next voting">
      <div class="nq-card-header">
        <h1>Preparing for the next voting...</h1>
      </div>

      <div class="nq-card-body">
        <p v-if="nextVoting.announcement">
          {{ nextVoting.announcement }}
        </p>
        <p v-if="nextVoting.link || nextVoting.announcementLink">
          <a class="nq-link" :href="`${nextVoting.announcementLink || nextVoting.link}`" target="_blank">
            Click here for more info.
          </a>
        </p>
        <p class="content">
          To stay up-to-date about votings and Nimiq in general, follow us on
          <a class="nq-link" href="https://twitter.com/nimiq">Twitter</a>
          or join us on
          <a class="nq-link" href="https://t.me/joinchat/AAAAAEJW-ozFwo7Er9jpHw">Telegram</a>
          and
          <a class="nq-link" href="https://www.nimiq.com/community/">many more social channels</a>.
          Looking forward to seeing you there!
        </p>
        <p v-if="pastVotings.length">
          <button class="vote-again nq-button-s" @click="clearNextVoting">
            See results of previous vote.
          </button>
        </p>
      </div>
    </div>

    <!-- voting -->
    <div v-else-if="votingConfig && !voted" class="nq-card voting" :class="type">
      <div class="nq-card-header">
        <h1>{{ votingConfig.label }}</h1>
        <p class="sub">
          <span v-if="type === VoteTypes.singleChoice">Please make your choice.</span>
          <span v-else-if="type === VoteTypes.multipleChoice">Please select one or more options.</span>
          <span v-else-if="type === VoteTypes.weightedChoices">Please weigh the items by preference.</span>
          <span v-else-if="type === VoteTypes.ranking">Drag items into position to rank by preference.</span>
          <span v-if="votingConfig.link">
            <br>
            <a class="nq-link" :href="votingConfig.link" target="_blank">Click here for more info.</a>
          </span>
        </p>

        <Tooltip
          preferred-position="bottom left"
          :styles="{ marginLeft: '-1rem', minWidth: type === VoteTypes.ranking ? '42rem' : '21rem' }"
        >
          <template #trigger>
            <InfoCircleSmallIcon />
          </template>
          <p v-if="type === VoteTypes.ranking">
            Your ranked choices will be counted according to a normalized geometric progression.<br>
            That means the 1st choice gets 1 point, the 2nd 1/2 points, 3rd 1/4 points and 4th 1/8 points.
            Next, the point values are normalized to a total of 1 and the resulting factor will be multiplied
            with the NIM in your vote. This way, each NIM represents exactly one vote distributed over your choices.
          </p>
          <p v-if="votingAddresses">
            The voting addresses are<br>{{ votingAddresses.join(', ') }}
          </p>
          <p>This voting is open until block {{ `#${votingConfig.end}` }}</p>
          <div class="note small">
            ~ {{ timeRemaining }}
          </div>
        </Tooltip>
      </div>

      <div class="nq-card-body">
        <div v-if="type === VoteTypes.singleChoice" class="choices nq-text" :class="choicesStyle">
          <div v-for="choice of choices" :key="choice.name" class="choice">
            <input :id="choice.name" v-model="singleChoice" class="radio" name="sc" type="radio" :value="choice.name">
            <label :for="choice.name">{{ choice.label }}</label>
          </div>
        </div>

        <div v-else-if="type === VoteTypes.multipleChoice" class="choices" :class="choicesStyle">
          <div v-for="choice of choices" :key="choice.name" class="choice">
            <input :id="choice.name" v-model="multipleChoices" class="check" type="checkbox" :value="choice.name">
            <label :for="choice.name">{{ choice.label }}</label>
          </div>
        </div>

        <div v-else-if="type === VoteTypes.weightedChoices" class="choices">
          <div v-for="choice of choices" :key="choice.name" class="choice">
            <label :for="choice.name">{{ choice.label }} ({{ Math.round(100 * choice.weight / totalWeight) }}%)</label>
            <input :id="choice.name" v-model.number="choice.weight" class="slider" type="range" min="0" max="99">
          </div>
        </div>

        <div v-else-if="type === VoteTypes.ranking" class="choices">
          <div class="left">
            <div v-for="(choice, index) of choices" :key="choice.name" class="number">
              {{ formatPosition(index + 1) }}
            </div>
          </div>
          <draggable
            v-model="choices" class="right" group="choiceRanking" item-key="name"
            @start="drag = true"
            @end="drag = false"
          >
            <template #item="{ element }">
              <div class="choice">
                {{ element.label }}
              </div>
            </template>
          </draggable>
        </div>
      </div>

      <div class="nq-card-footer">
        <p class="rules">
          Vote by sending 0.00001 NIM. <br> Every NIM in your address at the end of the voting period equals one vote.
        </p>
        <button class="nq-button light-blue" :disabled="!height || !canVote" @click="trySubmittingVote">
          {{ height ? 'vote' : 'waiting for chain height' }}
        </button>
        <div class="note">
          Votes are stored publicly on the blockchain.
        </div>
        <div v-if="errorVoting" class="error">
          <h3>Sorry, something went wrong submitting your vote.</h3>
          <p>{{ errorVoting }}</p>
          <CloseIcon class="close" @click="clearErrorVoting" />
        </div>
      </div>
    </div>

    <!-- results -->
    <div v-else class="nq-card results">
      <div class="nq-card-header">
        <template v-if="voted">
          <h1>Thank you for voting!</h1>
          <p class="sub">
            Your vote was submitted
            <a class="nq-link" :href="`http://${testnet ? 'test.' : ''}nimiq.watch/#${vote!.tx.hash}`" target="_blank">
              to the blockchain
            </a>.
          </p>
          <div class="note">
            Verification may take a few minutes. <a class="nq-link" href="javascript:location.reload()">Refresh.</a>
          </div>
        </template>
        <template v-else>
          <h1>{{ resultsConfig!.label }}</h1>
          <p class="sub">
            Voting results
          </p>
        </template>

        <Tooltip
          v-if="currentResults && resultsConfig" preferred-position="bottom left"
          :styles="{ marginLeft: '-1rem', minWidth: isPreliminary ? '34.5rem' : '30rem' }"
        >
          <template #trigger>
            <InfoCircleSmallIcon />
          </template>
          <p v-if="isPreliminary">
            This voting started at block {{ `#${resultsConfig.start}` }}<br>
            and will end at {{ `#${resultsConfig.end}` }},<br>
            approx. {{ blockDate(resultsConfig.start) }}<br>
            to {{ blockDate(resultsConfig.end) }}.
          </p>
          <p v-else>
            This voting took place<br>
            from block {{ `#${resultsConfig.start}` }}<br>
            to {{ `#${resultsConfig.end}` }},<br>
            approx. {{ blockDate(resultsConfig.start) }}<br>
            to {{ blockDate(resultsConfig.end) }}.
          </p>
          <p v-if="resultsAddresses">
            The addresses of this voting are<br>{{ resultsAddresses.join(', ') }}
          </p>
          <p>
            In total, {{ electionResults.stats.votes }} votes representing<br>
            {{ formatLunaAsNim(electionResults.stats.luna) }} were cast{{ isPreliminary ? ' so far' : '' }}.
          </p>
          <p v-for="result of electionResults.results" :key="result.label">
            {{ result.label }}: {{ result.votes.length }} votes representing<br>
            {{ formatLunaAsNim(result.value) }}.
          </p>
        </Tooltip>
      </div>

      <div class="nq-card-body">
        <p v-if="currentResults === false">
          Could not load results. Maybe the results are not available yet.
        </p>
        <p v-else-if="!currentResults">
          Loading... ({{ consensus ? 'consensus established, scanning blockchain' : 'waiting for consensus' }})
        </p>
        <p v-else-if="!electionResults.stats.votes">
          <span v-if="isPreliminary">No results yet. It might take a few minutes for the latest results to show.</span>
          <span v-else>No votes were recorded in this election.</span>
        </p>
        <section v-else class="graph" :class="{ many: electionResults.results.length > 3 }">
          <div v-for="result of electionResults.results" :key="result.label" class="result">
            <div class="votes">
              <div class="vote space" :style="`flex-grow: ${(maxChoiceValue - result.value) * barSizePerLuna}`" />
              <template v-for="voteItem of topVotes(result)" :key="voteItem.sender">
                <!-- eslint-disable style/max-len -->
                <div
                  v-if="voteItem.value * percentPerLuna > 0.1" class="vote"
                  :class="{ mini: barSizePerLuna * voteItem.value < minBarItemSize }"
                  :title="`${voteItem.sender} - ${formatLunaAsNim(voteItem.value)} - ${(voteItem.value * percentPerLuna).toFixed(2)}%`"
                  :style="`background: ${color(voteItem.sender)}; flex-grow: ${voteItem.value * barSizePerLuna};`"
                />
                <!-- eslint-enable style/max-len -->
              </template>
              <!-- eslint-disable style/max-len -->
              <div
                v-if="otherVotesValue(result) > 0" class="vote others"
                :title="`Others - ${formatLunaAsNim(otherVotesValue(result))} - ${(otherVotesValue(result) * percentPerLuna).toFixed(2)}%`"
                :style="`flex-grow: ${otherVotesValue(result) * barSizePerLuna}`"
              />
              <!-- eslint-enable style/max-len -->
            </div>
            <div class="label">
              {{ result.label }}
              <div class="note">
                {{ Math.round(result.value / electionResults.stats.luna * 100) }}%
              </div>
            </div>
            <div v-if="debug" class="debug">
              maxVoteCount {{ maxVoteCount }},
              maxValue: {{ maxChoiceValue }}Luna,
              percentPerLuna {{ percentPerLuna }}%,
              minSize {{ minBarItemSize }}
            </div>
          </div>
        </section>
      </div>

      <div class="nq-card-footer">
        <p class="graph-description">
          Bars indicate the weight of a vote.
          <template v-if="isPreliminary">
            <br> Results are preliminary.
          </template>
        </p>
        <div v-if="votingConfig" class="vote-again">
          <div class="note">
            You can change your vote by voting again. <br> The last vote per address counts.
          </div>
          <button class="vote-again nq-button-s" @click="clearVote">
            Vote Again
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
:root {
    --nimiq-blue: #1F2348;
    --ranking-height: 4.25rem;
}

#app {
    display: flex;
    flex-direction: row;
    justify-content: center;
}

#app.error {
    flex-direction: column;
    margin: auto;
}

.nq-link {
    cursor: pointer;
}

p {
    font-size: 2rem;
    line-height: 1.3;
}

.i > * {
    display: none;
}

.nq-card {
    min-height: 70.5rem;
    flex: 0 0 52.5rem;
    max-width: 100vw;
    display: flex;
    flex-direction: column;
    align-self: center;
}

.nq-card .nq-card-header {
    flex: 0 0;
    position: relative;
}

.nq-card .nq-card-header h1 {
    font-size: 3rem;
    line-height: 1.3;
    font-weight: bold;
    margin: 0 1.5rem 1.5rem 1.5rem;
}

.nq-card .nq-card-header .sub {
    margin: 0;
    line-height: 1.5;
}

.nq-card .nq-card-header .sub a {
    font-weight: 600;
}

.nq-card .nq-card-header .tooltip {
    position: absolute;
    top: 2rem;
    right: 2rem;
    font-size: 2rem;
    text-align: right;
}

.nq-card .nq-card-header .tooltip svg {
    color: rgba(31, 35, 72, 0.25);
}

.nq-card .nq-card-header .tooltip .tooltip-box p {
    font-size: inherit;
}

.nq-card .nq-card-header .tooltip .tooltip-box :first-child {
    margin-top: 0;
}

.nq-card .nq-card-header .tooltip .tooltip-box :last-child {
    margin-bottom: 0;
}

.nq-card .nq-card-body {
    flex: 1 0;
    display: flex;
    flex-direction: column;
    text-align: center;
}

.nq-card .nq-card-footer {
    flex: 0 0;
    padding-left: 4rem;
    padding-right: 4rem;
    text-align: center;
}

.nq-card .nq-card-footer .nq-button {
    margin-top: 4rem;
    margin-bottom: 1rem;
    min-width: 33.75rem;
}

.note {
    opacity: 0.5;
    font-size: 1.75rem;
    line-height: 2.125rem;
    font-weight: 600;
}

.note.small {
    font-size: 1.5rem;
}

.voting.next .content {
    flex: 1;
}

.voting .choices {
    padding: 0;
    display: flex;
    flex: 1 0;
}

.voting .choices .choice input {
    display: none;
}

.voting .choices .choice label {
    font-weight: bold;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 2.5rem;
    line-height: 1;
    cursor: pointer;
}

.voting.singleChoice .choices,
.voting.multipleChoice .choices {
    flex-direction: row;
    justify-content: space-between;
    height: 100%;
}

.voting.singleChoice .choices .choice,
.voting.multipleChoice .choices .choice {
    flex: 0;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
}

.voting.singleChoice .choices .choice label,
.voting.multipleChoice .choices .choice label {
    flex: 1 0 calc(100% - 1rem);
    color: rgba(31, 35, 72, 0.5);
    border: 0.25rem solid rgba(31, 35, 72, 0.16);
    border-radius: 0.5rem;
    text-align: center;
    height: calc(100% - 2rem);
    transition: color 0.3s, border-color 0.3s;
}

.voting.singleChoice .choices .choice label:hover,
.voting.multipleChoice .choices .choice label:hover {
    color: rgba(31, 35, 72, 0.7);
    border-color: rgba(31, 35, 72, 0.3);
}

.voting.singleChoice .choices .choice input:checked + label,
.voting.multipleChoice .choices .choice input:checked + label {
    background: var(--nimiq-blue);
    color: white;
}

.voting.singleChoice .choices.wrap,
.voting.multipleChoice .choices.wrap {
    flex-wrap: wrap;
}

.voting.singleChoice .choices.two .choice,
.voting.multipleChoice .choices.two .choice {
    flex-basis: calc(50% - 1rem);
    min-height: 12.5rem;
}

.voting.singleChoice .choices.three .choice,
.voting.multipleChoice .choices.three .choice {
    flex-basis: calc(33.333% - 1rem);
    height: 12.5rem;
}

.voting.ranking .choices {
    flex-direction: row;
    justify-content: center;
}

.voting.ranking .choices .left,
.voting.ranking .choices .right {
    display: flex;
    flex-direction: column;
}

.voting.ranking .choices .left .number,
.voting.ranking .choices .left .choice,
.voting.ranking .choices .right .number,
.voting.ranking .choices .right .choice {
    height: var(--ranking-height);
    margin-bottom: 1rem;
    border-radius: 0.5rem;
    font-weight: bold;
    font-size: 2.5rem;
    line-height: var(--ranking-height);
}

.voting.ranking .choices .left {
    flex: 0;
}

.voting.ranking .choices .left .number {
    border: 0.25rem solid rgba(31, 35, 72, 0.16);
    color: rgba(31, 35, 72, 0.4);
    width: calc(1.666 * var(--ranking-height));
    line-height: calc(var(--ranking-height) - 0.4rem);
    margin-right: 1rem;
}

.voting.ranking .choices .right .choice {
    background: rgba(31, 35, 72, 0.06);
    background-image: url("/vote/img/grip.svg");
    background-repeat: no-repeat;
    background-position: 1rem center;
    color: var(--nimiq-blue);
    padding: 0 1rem 0 3rem;
    text-align: left;
    cursor: move;
}

.voting .nq-card-footer {
    position: relative;
}

.voting .nq-card-footer .error {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background: white;
    border: 0.25rem solid var(--nimiq-red);
    border-radius: 0.5rem;
    padding: 0 2rem;
}

.voting .nq-card-footer .error .close {
    position: absolute;
    top: 1.5rem;
    right: 1.5rem;
    cursor: pointer;
    opacity: 0.2;
}

.voting .nq-card-footer .note {
    line-height: 2.625rem;
}

.results .nq-card-header,
.results .nq-card-body {
    padding-bottom: 2rem;
}

.results .nq-card-body {
    padding-top: 0;
}

.results .graph {
    flex: 1;
    display: flex;
    flex-direction: row;
    justify-content: safe center;
    overflow: auto hidden;
}

.results .graph.many {
    justify-content: flex-start;
}

.results .graph .result {
    display: flex;
    flex-direction: column;
}

.results .graph .result + .result {
    margin-left: 3rem;
}

.results .graph .result .votes {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.results .graph .result .votes .vote {
    display: flex;
    flex-shrink: 0;
    width: 8rem;
    min-height: 0.125rem;
    margin-top: 0.125rem;
    overflow: hidden;
    border-radius: 0.5rem;
}

.results .graph .result .votes .vote:not(.space) {
    box-shadow: inset -2.25rem -2.25rem 3rem -2rem rgba(0, 0, 0, 0.1);
}

.results .graph .result .votes .vote.others {
    background: var(--nimiq-blue);
}

.results .graph .result .label {
    font-size: 2.5rem;
    font-weight: bold;
    margin-top: 2.5rem;
    white-space: nowrap;
}

.results .graph-description {
    margin-top: 0;
}

.results .vote-again {
    margin: 1.75rem 0 1rem;
}
</style>
