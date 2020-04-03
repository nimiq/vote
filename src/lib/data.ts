import { dummies, configAddress, votingLocation } from './const';
import { fetchJson } from './network';
import { ElectionResults, Config } from './types';
import { dummyConfig, dummyResult } from './dummies';

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
        ? fetchJson(`${votingLocation}${config!.results}`)
        : dummyResult;
}
