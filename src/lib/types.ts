export type Nimiq = typeof import('@nimiq/core-web');

// Votes
export enum VoteTypes {
    singleChoice = 'singleChoice',
    multipleChoice = 'multipleChoice',
    weightedChoices = 'weightedChoices',
    ranking = 'ranking',
}

export type BaseChoice = {
    name: string,
    weight: number,
}

export type BaseVote = {
    name: string,
    choices: BaseChoice[],
}

export type FixedChoice = {
    name: string,
    weight: 1,
}

export type WeightedChoice = {
    name: string,
    weight: number,
}

export type SingleChoiceVote = BaseVote & {
    choices: [FixedChoice],
}

export type MultipleChoiceVote = BaseVote & {
    choices: FixedChoice[],
}

export type WeightedCoicesVote = BaseVote & {
    choices: WeightedChoice[],
}

export type RankingVote = BaseVote & {
    choices: WeightedChoice[],
}

// Config
export type Choice = {
    name: string, // short, will be on the blockchain
    label?: string, // defaulting to name
}

export type Config = {
    start: number, // start block
    end: number, // end block
    type: VoteTypes,
    name: string, // short, will be on the blockchain
    label: string, // short description of the purpose of the voting
    choices: Choice[],
    // results?: string,
}

// App
export type Option = BaseChoice & {
    label: string,
}

export type Receipt = {
    hash: string,
    vote: string,
}

export type CastVote<T extends BaseVote> = {
    vote: T,
    tx: {
        sender: string,
        value: number,
        height: number,
    },
    value: number,
}

export type ElectionVote = {
    sender: string,
    value: number,
    height: number,
}

export type ElectionResult = {
    label: string,
    value: number,
    votes: ElectionVote[],
}

export type ElectionResults = {
    label: string,
    results: ElectionResult[],
    stats: {
        votes: number,
        nim: number,
    },
}
