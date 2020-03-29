import { VoteTypes } from './lib/votes';

export type Config = {
    start: number, // start block
    end: number, // end block
    type: VoteTypes,
    name: string, // short, will be on the blockchain
    label?: string, // defaulting to name
    options?: OptionConfig[],
}

export type OptionConfig = {
    name: string, // short, will be on the blockchain
    label?: string, // defaulting to name
}

async function _load(url: string, dummy = false): Promise<Array<Config>> {
    try {
        return !dummy
            ? (await (await fetch(url)).json()).votings
            : [{
                start: 100000,
                end: 101000,
                label: 'What\'s the best ice cream: Vanilla or Chocolate?',
                name: 'best ice cream',
                type: VoteTypes.weightedChoices,
                options: [{
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

export async function loadConfig(url: string): Promise<Array<Config>> {
    return loading || (loading = _load(url));
}
