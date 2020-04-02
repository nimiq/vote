import { VoteTypes } from './lib/votes';

export type Choice = {
    name: string, // short, will be on the blockchain
    label?: string, // defaulting to name
}

export type Config = {
    start: number, // start block
    end: number, // end block
    type: VoteTypes,
    name: string, // short, will be on the blockchain
    label?: string, // defaulting to name
    choices: Choice[],
}

async function _load(url: string, dummy: boolean): Promise<Array<Config>> {
    try {
        return !dummy
            ? (await (await fetch(url)).json()).votings
            : [{
                start: 1030884,
                end: 1040884,
                label: 'What\'s the best ice cream: Vanilla or Chocolate?',
                name: 'best ice cream',
                type: VoteTypes.singleChoice,
                choices: [{
                    name: 'vanilla',
                    label: 'Vanilla',
                }, {
                    name: 'chocolate',
                    label: 'Chocolate',
                }],
            }];
    } catch (e) {
        throw new Error(`Failed to load configuration from ${url}. Reason ${e}`);
    }
}

let loading: Promise<Array<Config>>;

export async function loadConfig(url: string, dummy = false): Promise<Array<Config>> {
    return loading || (loading = _load(url, dummy));
}
