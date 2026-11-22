import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// Layer rules (see CLAUDE.md → Architecture): core knows nothing about UI or connectors,
// connectors know nothing about the UI. Only app/ may import React.
const uiImports = ['react', 'react-dom', 'react-dom/*', 'react-i18next', 'i18next', 'dexie-react-hooks'];

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'test-results', 'playwright-report', 'screenshots'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
  },
  {
    files: ['app/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: uiImports,
          patterns: [
            { group: ['**/app/**', '**/connectors/**'], message: 'core/ must not depend on app/ or connectors/.' },
          ],
        },
      ],
    },
  },
  {
    files: ['connectors/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: uiImports,
          patterns: [{ group: ['**/app/**'], message: 'connectors/ must not depend on app/.' }],
        },
      ],
    },
  },
  {
    files: ['*.config.{ts,js}', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
