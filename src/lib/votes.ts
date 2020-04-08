import { unique } from 'typescript-array-utils';
import { toBase32, ibanCheck, CCODE } from './core';
import { VoteTypes, BaseVote, SingleChoiceVote, WeightedCoicesVote, MultipleChoiceVote, RankingVote, WeightedChoice,
    Config } from './types';

const ELEMENT_SEPARATOR = '/';
const WEIGHT_SEPARATOR = ':';

export function parseVote(message: string, type: VoteTypes.singleChoice): SingleChoiceVote;
export function parseVote(message: string, type: VoteTypes.multipleChoice): MultipleChoiceVote;
export function parseVote(message: string, type: VoteTypes.weightedChoices): WeightedCoicesVote;
export function parseVote(message: string, type: VoteTypes.ranking): RankingVote;
export function parseVote(message: string, type: string): BaseVote;
export function parseVote(
    message: string,
    type: VoteTypes | string,
): SingleChoiceVote | MultipleChoiceVote | WeightedCoicesVote {
    function invalid(reason: string) {
        throw new Error(`Invalid vote: "${message}" is not a valid "${type}" vote. Reason: ${reason}.`);
    }
    if (message.startsWith('Vote')) {
        // Human readable version
        try {
            // Vote_<Election name as string>_<options>
            const elements = message.split(ELEMENT_SEPARATOR);
            elements.shift();
            const name = elements.shift()!;
            switch (type) {
                case VoteTypes.singleChoice: {
                    if (elements.length !== 1) invalid('only one answer expected');
                    return { name, choices: [{ name: elements[0], weight: 1 }] };
                }
                case VoteTypes.multipleChoice: {
                    if (elements.length !== unique(elements).length) invalid('choices must be unique');
                    return { name, choices: elements.map((choice) => ({ name: choice, weight: 1 })) };
                }
                case VoteTypes.weightedChoices: {
                    const choices: WeightedChoice[] = elements.map(((option) => {
                        const [choiceName, weight] = option.split(WEIGHT_SEPARATOR);
                        return { name: choiceName, weight: parseInt(weight, 10) };
                    }));
                    if (choices.length !== unique(choices, (a, b) => a.name === b.name).length) {
                        invalid('choices must be unique');
                    }
                    if (choices.filter((choice) => choice.weight < 0 || choice.weight > 99).length > 0) {
                        invalid('choice weights must be between 0 and 99 (inclusive).');
                    }
                    return { name, choices };
                }
                case VoteTypes.ranking: {
                    if (elements.length !== unique(elements).length) invalid('choices must be unique');
                    const choices = elements.map((choice, pos) => ({ name: choice, weight: elements.length - pos }));
                    return { name, choices };
                }
                default: throw new Error(`Vote type "${type}" does not exist`);
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
    return choices.map((choice) => choice.weight).reduce((previous, current) => previous + current);
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
