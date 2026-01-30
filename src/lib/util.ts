// from https://github.com/mleko/typescript-array-utils
const identityCompare = <T>(a: T, b: T): boolean => a === b;

export function unique<T>(array: T[], compare: (a: T, b: T) => boolean = identityCompare): T[] {
    return array.filter((e, index) => index === array.findIndex((v: T) => compare(e, v)));
}

export function allUnique<T>(array: T[], compare: (a: T, b: T) => boolean = identityCompare) {
    return array.length === unique(array, compare).length;
}

export function blockDate(height: number, currentHeight: number): Date {
    const now = new Date().getTime();
    return new Date(now + blocksToSeconds(height - currentHeight) * 1000);
}

// Block time in Nimiq Albatross is 1 second, but only for micro blocks.
// Macro blocks, which happen every 60 micro blocks, do not wait 1 second for producing but take only ~100ms.
// Thus, 60 blocks only take 59.1 seconds on average.
export function blocksToSeconds(blocks: number): number {
    return blocks * (59.1 / 60);
}
