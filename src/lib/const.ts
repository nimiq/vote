export const production = false;
const specialConfig = 'staging';
const useDummies = false;
const showDebugging = false;

export const testnet = !production;
export const dummies = useDummies && !production;
export const debug = showDebugging && !production;
export const votingLocation = 'https://nimiq.community/voting.';
export const configAddress = `${votingLocation}${specialConfig ? specialConfig : production ? 'live' : 'test'}.json`;
