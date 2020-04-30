// from https://github.com/mleko/typescript-array-utils
const identityCompare = <T>(a: T, b: T): boolean => a === b;

export function unique<T>(array: T[], compare: (a: T, b: T) => boolean = identityCompare): T[] {
    return array.filter((e, index) => index === array.findIndex((v: T) => compare(e, v)));
}

export function allUnique <T>(array: T[], compare: (a: T, b: T) => boolean = identityCompare) {
    return array.length === unique(array, compare).length;
}
