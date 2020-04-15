import { unique } from 'typescript-array-utils';
import { dummies, configAddress, votingLocation } from './const';
import { fetchJson } from './network';
import { ElectionResults, Config, VoteTypes } from './types';
import { dummyConfig, dummyResult } from './dummies';
import { voteAddress, ELEMENT_SEPARATOR, WEIGHT_SEPARATOR, serializeVote } from './votes';

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
        ? fetchJson(`${votingLocation}${await voteAddress(config, false)}.json`)
        : dummyResult;
}

// use this function to valid configuration settings
(window as any).votingAppValidateConfig = function votingAppValidateConfig(config: Config, height: number) {
    // choices need to be unique
    console.assert(
        config.choices.length === unique(config.choices.map((choice) => choice.name)).length,
        'Choices must be unique, i.e. names not used twice.',
    );

    // no special characters have been used
    const names = config.name + config.choices.map((choice) => choice.name).join('');
    console.assert(
        !names.includes(ELEMENT_SEPARATOR) && !names.includes(WEIGHT_SEPARATOR),
        `Names must not include "${ELEMENT_SEPARATOR}" and "${WEIGHT_SEPARATOR}".`,
    );
    if (names.includes(' ')) {
        console.warn('Using spaces in names is OK, but not recommened.');
    }

    // valid config type
    console.assert(
        Object.values(VoteTypes).includes(config.type),
        `The config type ${config.type} is invalid. Should be one of ${Object.values(VoteTypes)}.
        Use the VoteTypes enum to get a valid type.`,
    );

    // max serialized vote = 64 bytes?
    const serialized = serializeVote({
        name: config.name,
        choices: config.choices.map((choice) => ({ name: choice.name, weight: 100 })),
    }, config.type);
    console.assert(
        serialized.length <= 64,
        `Names are too long. Votes for this config might be up to ${serialized.length} bytes, maximum is 64 bytes.`,
    );

    // simple stuff
    console.assert(config.start < config.end, 'End must be greater than start.');
    console.assert(!!config.name && config.choices.filter((choice) => !!choice.name).length === 0, 'no empty names');

    if (height) {
        const now = new Date().getTime();
        const start = new Date(now + (config.start - height) * 60000);
        const end = new Date(now + (config.end - height) * 60000);
        console.log(`The voting will approx. start at ${start} end end at ${end}.`);
    }
};
