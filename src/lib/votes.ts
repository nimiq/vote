import { toBase32, ibanCheck, CCODE } from './core';
import { allUnique } from './util';
import { VoteTypes, BaseVote, SingleChoiceVote, WeightedCoicesVote, MultipleChoiceVote, RankingVote, WeightedChoice,
    Config } from './types';

export const ELEMENT_SEPARATOR = ' ';
export const WEIGHT_SEPARATOR = ':';

export function parseVote(message: string, config: Config, type: VoteTypes.singleChoice): SingleChoiceVote;
export function parseVote(message: string, config: Config, type: VoteTypes.multipleChoice): MultipleChoiceVote;
export function parseVote(message: string, config: Config, type: VoteTypes.weightedChoices): WeightedCoicesVote;
export function parseVote(message: string, config: Config, type: VoteTypes.ranking): RankingVote;
export function parseVote<Vote extends BaseVote>(message: string, config: Config): Vote;
export function parseVote(
    message: string,
    config: Config,
): SingleChoiceVote | MultipleChoiceVote | WeightedCoicesVote {
    function invalid(reason: string) {
        throw new Error(`Invalid vote: "${message}" is not a valid "${config.type}" vote. Reason: ${reason}.`);
    }
    if (message.startsWith('Vote')) {
        // Human readable version
        try {
            // Vote <Election name as string> <options>
            const elements = message.split(ELEMENT_SEPARATOR).slice(1);
            const name = elements.shift()!;
            const validChoices = config.choices.map((choice) => choice.name);

            // basic validation
            if (name !== config.name) invalid(`Vote name doesn't match ${config.name}.`);
            if (elements.length < 1) invalid('At least one choice required.');

            switch (config.type) {
                case VoteTypes.singleChoice: {
                    if (elements.length !== 1) invalid('Exactly one answer required.');
                    if (!validChoices.includes(elements[0])) invalid(`Choice should be one of ${validChoices}.`);
                    return { name, choices: [{ name: elements[0], weight: 1 }] };
                }
                case VoteTypes.multipleChoice: {
                    if (!allUnique(elements)) invalid('Choices must be unique.');
                    if (elements.some((choice) => validChoices.includes(choice))) {
                        invalid(`At least one choice from ${validChoices} is required.`);
                    }
                    return { name, choices: elements.map((choice) => ({ name: choice, weight: 1 })) };
                }
                case VoteTypes.weightedChoices: {
                    const choices: WeightedChoice[] = elements.map(((option) => {
                        const [choiceName, weight] = option.split(WEIGHT_SEPARATOR);
                        return { name: choiceName, weight: parseInt(weight, 10) };
                    }));
                    if (!allUnique(choices, (a, b) => a.name === b.name)) invalid('Choices must be unique.');
                    if (choices.some((choice) => validChoices.includes(choice.name))) {
                        invalid(`At least one choice from ${validChoices} is required.`);
                    }
                    if (choices.filter((choice) => choice.weight < 0 || choice.weight > 99).length > 0) {
                        invalid('Choice weights must be between 0 and 99 (inclusive).');
                    }
                    return { name, choices };
                }
                case VoteTypes.ranking: {
                    if (!allUnique(elements)) invalid('Choices must be unique.');
                    if (elements.length !== validChoices.length) {
                        invalid(`Requires exactly ${validChoices.length} choices.`);
                    }
                    if (!elements.every((choice) => validChoices.includes(choice))) {
                        invalid(`Choices must include all ${validChoices}.`);
                    }
                    let factor = 2;
                    const choices = elements.map((choice) => ({ name: choice, weight: factor /= 2 }));
                    return { name, choices };
                }
                default: throw new Error(`Vote type "${config.type}" does not exist`);
            }
        } catch (e) {
            throw new Error(`Parsing vote failed. Reason: ${e}`);
        }
    }
    throw new Error(`Not a voting message or format not supported "${message}"`);
}

function serializeChoice(
    vote: SingleChoiceVote | MultipleChoiceVote | WeightedCoicesVote | RankingVote,
    type: VoteTypes,
    prefix = 'Vote',
): string {
    if (prefix === 'Vote') {
        switch (type) {
            case VoteTypes.singleChoice: return (vote as SingleChoiceVote).choices[0].name;
            case VoteTypes.multipleChoice: return (vote as MultipleChoiceVote).choices
                .map((choice) => choice.name)
                .join(ELEMENT_SEPARATOR);
            case VoteTypes.weightedChoices: return (vote as WeightedCoicesVote).choices
                .map((choice) => `${choice.name}${WEIGHT_SEPARATOR}${Math.round(choice.weight)}`)
                .join(ELEMENT_SEPARATOR);
            case VoteTypes.ranking: return (vote as RankingVote).choices
                .sort((a, b) => b.weight - a.weight) // highest first
                .map((choice) => choice.name)
                .join(ELEMENT_SEPARATOR);
            default: throw new Error(`Vote type "${type}" does not exist`);
        }
    }
    throw new Error(`Format "${prefix}" not supported.`);
}

export function serializeVote(
    vote: SingleChoiceVote | MultipleChoiceVote | WeightedCoicesVote | RankingVote,
    type: VoteTypes,
    prefix = 'Vote',
): string {
    if (prefix === 'Vote') {
        return [prefix, vote.name, serializeChoice(vote, type, prefix)].join(ELEMENT_SEPARATOR);
    }
    throw new Error(`Format "${prefix} not supported.`);
}

export function voteTotalWeight(choices: WeightedChoice[]) {
    return choices.reduce((total, choice) => total + choice.weight, 0);
}

const crypto = window.crypto.subtle || window.crypto;
const encoder = new TextEncoder();
async function configHash(config: Config): Promise<ArrayBuffer> {
    const message = JSON.stringify(config);
    const data = encoder.encode(message);
    return crypto.digest('SHA-256', data);
}

export async function voteAddress(config: Config, spaces = true): Promise<string> {
    const hash = await configHash(config);
    const base32 = toBase32(new Uint8Array(hash));
    const digits = `V0TE${base32.slice(0, 28)}`;
    // eslint-disable-next-line prefer-template
    const check = ('00' + (98 - ibanCheck(digits + CCODE + '00'))).slice(-2);
    const address = CCODE + check + digits;
    return spaces ? address.replace(/.{4}/g, '$& ').trim() : address;
}
