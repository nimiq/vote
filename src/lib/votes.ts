export enum VoteTypes {
    yesNo,
    multipleChoice,
    weightedChoices,
}

type BaseVote = {
    name: string,
}

export enum YesNo {
    no = 'no',
    yes = 'yes',
}

type YesNoVote = BaseVote & {
    answer: YesNo;
}

type MultipleChoiceVote = BaseVote & {
    choices: string[],
}

type WeightedCoicesVote = BaseVote & {
    choices: WeightedChoice[],
}

type WeightedChoice = {
    name: string,
    weight: number,
}

export function parseVote(message: string, type: VoteTypes.yesNo): YesNoVote
export function parseVote(message: string, type: VoteTypes.multipleChoice): MultipleChoiceVote
export function parseVote(message: string, type: VoteTypes.weightedChoices): WeightedCoicesVote
export function parseVote(message: string, type: VoteTypes): YesNoVote | MultipleChoiceVote | WeightedCoicesVote {
    if (message.startsWith('Vote')) {
        // Human readable version
        try {
            // Vote_<Election name as string>_<options>
            const elements = message.split('_');
            elements.shift();
            const name = elements.shift()!;
            switch(type) {
                case VoteTypes.yesNo: return { name, answer: elements[0] == "yes" ? YesNo.yes : YesNo.no }
                case VoteTypes.multipleChoice: return { name, choices: elements }
                case VoteTypes.weightedChoices: {
                    const choices: WeightedChoice[] = elements.map((option => {
                        const [name, weight] = option.split(':');
                        return { name, weight: parseInt(weight, 10) };
                    }));
                    return { name, choices }
                }
                default: throw `Vote type "${type}" does not exist`;
            }
        }
        catch (e) {
            // TODO throw?
            console.warn('Parsing vote failed', message, type, e);
        }
    }
    throw `Not a voting message or format not supported "${message}"`;
}

export function serializeVote(vote: YesNoVote, type: VoteTypes.yesNo, prefix: string): string
export function serializeVote(vote: MultipleChoiceVote, type: VoteTypes.multipleChoice, prefix: string): string
export function serializeVote(vote: WeightedCoicesVote, type: VoteTypes.weightedChoices, prefix: string): string
export function serializeVote(vote: YesNoVote | MultipleChoiceVote | WeightedCoicesVote, type: VoteTypes, prefix = 'Vote'): string {
    if (prefix == 'Vote') {
        return `${prefix}_${vote.name}_${serializeChoice(vote, type, prefix)}`;
    }
    throw `Format "${prefix} not supported.`;
}

function serializeChoice(vote: YesNoVote | MultipleChoiceVote | WeightedCoicesVote, type: VoteTypes, prefix = 'Vote'): string {
    if (prefix == 'Vote') {
        switch(type) {
            case VoteTypes.yesNo: return (vote as YesNoVote).answer
            case VoteTypes.multipleChoice: return (vote as MultipleChoiceVote).choices.join('_')
            case VoteTypes.weightedChoices: return (vote as WeightedCoicesVote).choices
                .map((choice) => `${choice.name}:${choice.weight}`)
                .join('_');
            default: throw `Vote type "${type}" does not exist`;
        }
        return `${prefix}_${this.name}_${this.serializeOptions(prefix)}`;
    }
    throw `Format "${prefix} not supported.`;
}
