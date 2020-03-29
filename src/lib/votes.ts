import { unique } from 'typescript-array-utils';
import { LimitIterable } from '@nimiq/core-web';

export enum VoteTypes {
    yesNo = 'yesNo',
    multipleChoice = 'multipleChoice',
    weightedChoices = 'weightedChoices',
}

export type BaseVote = {
    name: string,
}

export enum YesNo {
    no = 'no',
    yes = 'yes',
}

export type YesNoVote = BaseVote & {
    answer: YesNo,
}

export type MultipleChoiceVote = BaseVote & {
    choices: string[],
}

export type WeightedCoicesVote = BaseVote & {
    choices: WeightedChoice[],
}

export type WeightedChoice = {
    name: string,
    weight: number,
}

export function parseVote(message: string, type: VoteTypes.yesNo): YesNoVote;
export function parseVote(message: string, type: VoteTypes.multipleChoice): MultipleChoiceVote;
export function parseVote(message: string, type: VoteTypes.weightedChoices): WeightedCoicesVote;
export function parseVote(message: string, type: string): BaseVote;
export function parseVote(
    message: string,
    type: VoteTypes | string,
): YesNoVote | MultipleChoiceVote | WeightedCoicesVote {
    function invalid(reason: string) {
        throw new Error(`Invalid vote: "${message}" is not a valid "${type}" vote. Reason: ${reason}.`);
    }
    if (message.startsWith('Vote')) {
        // Human readable version
        try {
            // Vote_<Election name as string>_<options>
            const elements = message.split('_');
            elements.shift();
            const name = elements.shift()!;
            switch (type) {
                case VoteTypes.yesNo: {
                    if (elements.length !== 1) invalid('only one answer expected');
                    const answer = elements[0];
                    if (answer === 'yes' || answer === 'no') invalid('only yes or no expected');
                    return { name, answer: elements[0] === 'yes' ? YesNo.yes : YesNo.no };
                }
                case VoteTypes.multipleChoice: {
                    if (elements.length !== unique(elements).length) invalid('choices must be unique');
                    return { name, choices: elements };
                }
                case VoteTypes.weightedChoices: {
                    const choices: WeightedChoice[] = elements.map(((option) => {
                        const [name2, weight] = option.split(':');
                        return { name: name2, weight: parseInt(weight, 10) };
                    }));
                    if (choices.length !== unique(choices, (a, b) => a.name === b.name).length) {
                        invalid('choices must be unique');
                    }
                    if (choices.filter((choice) => choice.weight < 0 || choice.weight > 99).length > 0) {
                        invalid('choice weights must be between 0 and 99 (inclusive).');
                    }
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
    vote: YesNoVote | MultipleChoiceVote | WeightedCoicesVote,
    type: VoteTypes,
    prefix = 'Vote',
): string {
    if (prefix === 'Vote') {
        switch (type) {
            case VoteTypes.yesNo: return (vote as YesNoVote).answer;
            case VoteTypes.multipleChoice: return (vote as MultipleChoiceVote).choices.join('_');
            case VoteTypes.weightedChoices: return (vote as WeightedCoicesVote).choices
                .map((choice) => `${choice.name}:${choice.weight}`)
                .join('_');
            default: throw new Error(`Vote type "${type}" does not exist`);
        }
    }
    throw new Error(`Format "${prefix}" not supported.`);
}

export function serializeVote(vote: YesNoVote, type: VoteTypes.yesNo, prefix?: string): string
export function serializeVote(vote: MultipleChoiceVote, type: VoteTypes.multipleChoice, prefix?: string): string
export function serializeVote(vote: WeightedCoicesVote, type: VoteTypes.weightedChoices, prefix?: string): string
export function serializeVote(
    vote: YesNoVote | MultipleChoiceVote | WeightedCoicesVote,
    type: VoteTypes,
    prefix = 'Vote',
): string {
    if (prefix === 'Vote') {
        return `${prefix}_${vote.name}_${serializeChoice(vote, type, prefix)}`;
    }
    throw new Error(`Format "${prefix} not supported.`);
}

export function voteTotalWeight(choices: WeightedChoice[]) {
    return choices.map((choice) => choice.weight).reduce((previous, current) => previous + current);
}
