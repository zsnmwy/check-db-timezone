import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

const restrictedDateRules = [
  'error',
  {
    selector: "NewExpression[callee.name='Date']",
    message: '业务代码禁止 new Date()，请使用 src/time/policy.ts。',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: '业务代码禁止 Date.now()，请使用 src/time/policy.ts。',
  },
];

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'src/generated/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/time/policy.ts'],
    rules: {
      'no-restricted-syntax': restrictedDateRules,
    },
  },
  {
    files: ['tests/**/*.ts', 'src/time/policy.ts', 'src/time/runtime-check.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
];
