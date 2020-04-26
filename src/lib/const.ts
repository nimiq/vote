export const production = false;
const specialConfig = 'https://nimiq.community/voting.test.json';
const useDummies = false;
const showDebugging = false;

export const testnet = !production;
export const dummies = useDummies && !production;
export const debug = showDebugging && !production;
export const configLocation = 'config/';
export const configAddress = specialConfig || `${configLocation}${production ? 'live' : 'test'}.json`;
export const resultsLocation = 'results/';
export const contactInfo = 'Please contact Sven at sven@nimiq.com or via Telegram @svubx.';
