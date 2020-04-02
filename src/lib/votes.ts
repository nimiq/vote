import { unique } from 'typescript-array-utils';

export enum VoteTypes {
    // yesNo = 'yesNo',
    singleChoice = 'singleChoice',
    multipleChoice = 'multipleChoice',
    weightedChoices = 'weightedChoices',
}

export type BaseChoice = {
    name: string,
    weight: number,
}

export type BaseVote = {
    name: string,
    choices: BaseChoice[],
}

// export enum YesNo {
//     no = 'no',
//     yes = 'yes',
// }

export type FixedChoice = {
    name: string,
    weight: 1,
}

export type WeightedChoice = {
    name: string,
    weight: number,
}

export type SingleChoiceVote = BaseVote & {
    choices: [FixedChoice],
}

export type MultipleChoiceVote = BaseVote & {
    choices: FixedChoice[],
}

export type WeightedCoicesVote = BaseVote & {
    choices: WeightedChoice[],
}

export function parseVote(message: string, type: VoteTypes.singleChoice): SingleChoiceVote;
export function parseVote(message: string, type: VoteTypes.multipleChoice): MultipleChoiceVote;
export function parseVote(message: string, type: VoteTypes.weightedChoices): WeightedCoicesVote;
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
            const elements = message.split('_');
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
    vote: SingleChoiceVote | MultipleChoiceVote | WeightedCoicesVote,
    type: VoteTypes,
    prefix = 'Vote',
): string {
    if (prefix === 'Vote') {
        switch (type) {
            case VoteTypes.singleChoice: return (vote as SingleChoiceVote).choices[0].name;
            case VoteTypes.multipleChoice: return (vote as MultipleChoiceVote).choices
                .map((choice) => choice.name)
                .join('_');
            case VoteTypes.weightedChoices: return (vote as WeightedCoicesVote).choices
                .map((choice) => `${choice.name}:${Math.round(choice.weight)}`)
                .join('_');
            default: throw new Error(`Vote type "${type}" does not exist`);
        }
    }
    throw new Error(`Format "${prefix}" not supported.`);
}

// export function serializeVote(vote: SingleChoiceVote, type: VoteTypes.singleChoice, prefix?: string): string
// export function serializeVote(vote: MultipleChoiceVote, type: VoteTypes.multipleChoice, prefix?: string): string
// export function serializeVote(vote: WeightedCoicesVote, type: VoteTypes.weightedChoices, prefix?: string): string
export function serializeVote(
    vote: SingleChoiceVote | MultipleChoiceVote | WeightedCoicesVote,
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
