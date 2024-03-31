import { dummies, configAddress, resultsLocation } from './const';
import { fetchJson } from './network';
import { ElectionResults, Config, VoteTypes } from './types';
import { dummyConfig, dummyResult } from './dummies';
import { voteAddresses, ELEMENT_SEPARATOR, WEIGHT_SEPARATOR, serializeVote } from './votes';
import { allUnique, blockDate } from './util';

async function _load(url: string): Promise<Array<Config>> {
    try {
        return !dummies
            ? (await (await fetch(url)).json()).votings
            : dummyConfig;
    } catch (e) {
        throw new Error(`Failed to load configuration from ${url}. Reason ${e}`);
    }
}

let loading: Promise<Array<Config>>;
export async function loadConfig(): Promise<Array<Config>> {
    return loading || (loading = _load(configAddress));
}

export async function loadResults(config: Config): Promise<ElectionResults> {
    return !dummies
        ? fetchJson(`${resultsLocation}${(await voteAddresses(config, false))[0]}.json`)
        : dummyResult;
}

// Use this function to validate your voting configuration.
(window as any).validateVotingConfig = async function validateVotingConfig(config: Config, height: number) {
    // Basics
    console.assert(config.start < config.end, 'End must be greater than start.');
    console.assert(!!config.name && config.choices.filter((choice) => !choice.name).length === 0, 'no empty names');

    // Choices need to be unique
    console.assert(
        allUnique(config.choices.map((choice) => choice.name)),
        'Choices must be unique, i.e. names must not be used twice.',
    );

    // No special characters have been used
    const names = config.name + config.choices.map((choice) => choice.name).join('');
    console.assert(
        !names.includes(ELEMENT_SEPARATOR) && !names.includes(WEIGHT_SEPARATOR),
        `Names must not include "${ELEMENT_SEPARATOR}" and "${WEIGHT_SEPARATOR}".`,
    );
    if (names.includes(' ')) {
        console.warn('Using spaces in names is not recommened.');
    }

    // Valid config type
    console.assert(
        Object.values(VoteTypes).includes(config.type),
        `The config type ${config.type} is invalid. Should be one of ${Object.values(VoteTypes)}.
        Use the VoteTypes enum for valid types.`,
    );

    // Max serialized vote <= 64 bytes?
    const serialized = serializeVote({
        name: config.name,
        choices: config.choices.map((choice) => ({ name: choice.name, weight: 100 })),
    }, config.type);
    console.assert(
        serialized.length <= 64,
        `Names are too long. Votes for this config might be up to ${serialized.length} bytes, maximum is 64 bytes.`,
    );

    console.log('All good!');

    if (height) {
        const start = blockDate(config.start, height);
        const end = blockDate(config.end, height);
        console.log(`The voting will approximately start at ${start} and end at ${end}.`);
    }

    console.log(`The voting addresses are\n${(await voteAddresses(config, true)).join('\n')}`);
};

// Use this function to validate your voting configuration.
(window as any).expectedBlockHeight = function expectedBlockHeight(date: Date | string, currentHeight: number) {
    const now = new Date().getTime();
    const expectedTime = typeof date === 'string' ? Date.parse(date) : date.getTime();
    const deltaBlocks = Math.floor((expectedTime - now) / 60000);
    console.log(expectedTime, deltaBlocks);
    console.log(`At ${date} (${new Date(expectedTime)}), Nimiq should be at block height
    ${currentHeight + deltaBlocks}.
    That's ${deltaBlocks} blocks from ${currentHeight}.`);
};
