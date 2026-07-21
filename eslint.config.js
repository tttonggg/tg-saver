import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        chrome: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Node-context files: build tooling and tests.
    files: ['build.js', 'tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        chrome: 'readonly',
      },
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'tests/fixtures/'],
  },
];
