export const production = false;
const specialConfig = '';
const useDummies = false;
const showDebugging = false;

export const testnet = !production;
export const dummies = useDummies && !production;
export const debug = showDebugging && !production;
export const votingLocation = 'https://nimiq.community/voting.';
export const configAddress = `${votingLocation}${specialConfig || (production ? 'live' : 'test')}.json`;
export const contactInfo = 'Please contact Sven at sven@nimiq.com or via Telegram @svubx.';
