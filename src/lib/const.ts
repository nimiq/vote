export const production = false;
export const testnet = !production;
export const dummies = false;
export const debug = false;
export const votingLocation = 'https://nimiq.community/voting.';
export const configAddress = `${votingLocation}${production ? 'live' : 'test'}.json`;
