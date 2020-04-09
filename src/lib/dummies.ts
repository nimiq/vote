import { VoteTypes } from './types';

export const dummyResult = {
    label: 'What\'s the best ice cream: Vanilla or Chocolate?',
    results: [
        {
            label: 'Chocolate',
            value: 50098253720,
            votes: [
                {
                    sender: 'NQ21 7JTK FF9C 7SJX FAS2 23R9 AUE1 VGGL SFCL',
                    height: 1030974,
                    value: 40091399999,
                },
                {
                    sender: 'NQ56 JKNP XV4K KXB4 E9KN 2BHF 2J4H TX2J STS8',
                    height: 1030961,
                    value: 3426861,
                },
                {
                    sender: 'NQ34 1MLR VDHE S3HD UG7M 2HYK 1PHU B0UU HAU8',
                    height: 1030928,
                    value: 10003426860,
                },
            ],
        },
        {
            label: 'Vanilla',
            value: 28003427747,
            votes: [
                {
                    sender: 'NQ20 6TQ0 J173 0NFX BG1B 8HQJ P6QD KJ3M L435',
                    height: 1031001,
                    value: 886,
                },
                {
                    sender: 'NQ96 A62U FUKM JKDN UU4B EYCN KDRL Q4CC KCGF',
                    height: 1030950,
                    value: 3426861,
                },
                {
                    sender: 'NQ34 1MLR VDHE S3HD UG7M 2HYK 1PHU B0UU HAU8',
                    height: 1030928,
                    value: 18000000000,
                },
            ],
        },
    ],
    stats: {
        votes: 5,
        nim: 78101681467,
    },
};

// ranking
// eslint-disable-next-line
const rankingConfig = [{
    start: 923198,
    end: 934298,
    label: 'What\'s the best ice cream?',
    name: 'best ice cream',
    type: VoteTypes.ranking,
    choices: [{
        name: 'vanilla',
        label: 'Vanilla',
    }, {
        name: 'chocolate',
        label: 'Chocolate',
    }, {
        name: 'strawberry',
        label: 'Strawberry',
    }, {
        name: 'none',
        label: 'I don\'t like ice cream.',
    }],
}, {
    start: 100,
    end: 1000,
    label: 'Test',
    name: 'test',
    type: VoteTypes.singleChoice,
    choices: [{
        name: 'vanilla',
        label: 'Vanilla',
    }, {
        name: 'chocolate',
        label: 'Chocolate',
    }],
    results: 'chocolate-vs-vanilla-2018',
}];

// single choice
// eslint-disable-next-line
const singleChoiceConfig = [{
    start: 920884,
    end: 1040884,
    label: 'Should Nimiq adjust its supply curve?',
    name: 'change-curve',
    type: VoteTypes.singleChoice,
    choices: [{
        name: 'Yes',
        label: 'Yes',
    }, {
        name: 'no',
        label: 'No',
    }],
}, {
    start: 100,
    end: 1000,
    label: 'Test',
    name: 'test',
    type: VoteTypes.singleChoice,
    choices: [{
        name: 'vanilla',
        label: 'Vanilla',
    }, {
        name: 'chocolate',
        label: 'Chocolate',
    }],
    results: 'chocolate-vs-vanilla-2018',
}];

export const dummyConfig = singleChoiceConfig;
