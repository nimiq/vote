export function vote() {
    return `Vote-`;
}

export abstract class Vote {

    name!: string;

    constructor(name: string) {
        this.name = name;
    }

    serialize(prefix: string = 'Vote'): string {
        if (prefix == 'Vote') {
            return `${prefix}_${this.name}_${this.serializeOptions(prefix)}`;
        }
        throw `Format "${prefix} not supported.`;
    }

    abstract serializeOptions(prefix: string): string;

    static _parse<Type extends Vote>(message: string, parse: (name: string, elements: string[]) => Type): Type {
        if (message.startsWith('Vote')) {
            // Human readable version
            try {
                // Vote_<Election name as string>_<options>
                const elements = message.split('_');
                elements.shift();
                const name = elements.shift()!;
                return parse(name, elements);
            }
            catch (e) {
                console.warn('Parsing vote failed', message, parse, e);
            }
        }
        throw `Not a voting message or format not supported "${message}"`;
    }
}

export type WeightedOptions = {
    name: string,
    weight: number,
}

export class WeightedVote extends Vote {

    options: WeightedOptions[];

    constructor(name: string, options: WeightedOptions[]) {
        super(name);
        this.options = options;
    }

    serializeOptions(prefix: string): string {
        if (prefix == 'Vote') {
            return this.options.map((option) => `${option.name}:${option.weight}`).join('_');
        }
        throw `Format "${prefix} not supported.`;
    }

    static parse(message: string): WeightedVote {
        return Vote._parse(message, this.parseOptions);
    }

    static parseOptions(name: string, elements: string[]): WeightedVote {
        // Vote_<Election name as string>_<option as string>:<weight as 0-99>
        const options: WeightedOptions[] = elements.map((option => {
            const [name, weight] = option.split(':');
            return { name, weight: parseInt(weight, 10) };
        }));
        return new WeightedVote(name, options);
    }
}

export enum YesNo {
    no = 'no',
    yes = 'yes',
}

export class YesNoVote extends Vote {

    answer!: YesNo;

    constructor(name: string, answer: YesNo) {
        super(name);
        this.answer = answer;
    }

    serializeOptions(prefix: string): string {
        if (prefix == 'Vote') {
            return this.answer;
        }
        throw `Format "${prefix} not supported.`;
    }

    static parse(message: string): YesNoVote {
        return Vote._parse(message, this.parseAnswer);
    }

    static parseAnswer(name: string, answers: string[]): YesNoVote {
        // Vote_<Election name as string>_<”yes” or “no”>
        return new YesNoVote(name, answers[0] == "yes" ? YesNo.yes : YesNo.no);
    }
}

export class MultipleChoiceVote extends Vote {
    choices!: string[];

    constructor(name: string, choices: string[]) {
        super(name);
        this.choices = choices;
    }

    serializeOptions(prefix: string): string {
        if (prefix == 'Vote') {
            return this.choices.join('_');
        }
        throw `Format "${prefix} not supported.`;
    }

    static parse(message: string): MultipleChoiceVote {
        return Vote._parse(message, this.parseChoices);
    }

    static parseChoices(name: string, choices: string[]): MultipleChoiceVote {
        // Vote_<Election name as string>_<choice name as string>_<next choice>
        return new MultipleChoiceVote(name, choices);
    }
}
