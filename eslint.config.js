import antfu from '@antfu/eslint-config';

export default antfu({
    vue: true,
    ignores: ['public/**'],
}, {
    rules: {
        'style/semi': ['error', 'always'],
        'style/indent': ['error', 4],
        'ts/consistent-type-definitions': ['error', 'type'],
        'style/arrow-parens': ['error', 'always'],
        'style/member-delimiter-style': ['error', {
            multiline: {
                delimiter: 'comma',
                requireLast: true,
            },
        }],
        'style/brace-style': ['error', '1tbs', { allowSingleLine: true }],
        'style/max-len': ['error', { code: 120, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreComments: true }],
        'no-console': 'off',
    },
});
