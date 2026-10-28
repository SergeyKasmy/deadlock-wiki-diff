// ESLint covers what `deno lint` cannot: type-aware rules, and the <script> blocks of .svelte files.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  ts.configs.strictTypeChecked,
  ts.configs.stylisticTypeChecked,
  svelte.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        // two projects: the app runs in the browser, the config files in Deno/Node
        project: ['./tsconfig.json', './tsconfig.node.json'],
        extraFileExtensions: ['.svelte'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // each side gets only its own globals, so e.g. `document` in a config file is an error
  { files: ['src/**'], languageOptions: { globals: globals.browser } },
  { files: ['*.config.{js,ts}'], languageOptions: { globals: globals.node } },
  {
    files: ['**/*.svelte'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  {
    rules: {
      // numbers read naturally in messages like `r${revid}`; everything else (objects, undefined…) stays an error
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/strict-boolean-expressions': ['error', {
        allowNullableObject: true,
        allowString: false,
        allowNumber: false,
      }],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-param-reassign': 'error',
      // the svelte variant allows `let` for $props(), which Svelte requires
      'prefer-const': 'off',
      'svelte/prefer-const': 'error',
      'object-shorthand': 'error',
      'svelte/no-at-html-tags': 'error',
      'svelte/require-each-key': 'error',
      'svelte/no-unused-class-name': 'off', // the wiki's HTML uses classes these components never see
      'svelte/block-lang': ['error', { script: 'ts', style: null }],
      'svelte/no-target-blank': 'error',
      'svelte/button-has-type': 'error',
    },
  },
);
