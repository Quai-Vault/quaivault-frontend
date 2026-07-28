import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Reports that the React compiler skipped optimizing a component because
      // a third-party library (here @tanstack/react-virtual) is opaque to it.
      // That is a fact about the dependency, not a defect we can act on, and
      // leaving it on would keep lint permanently failing its own gate.
      'react-hooks/incompatible-library': 'off',
      // The codebase already marks intentionally-unused bindings with a leading
      // underscore (matching what tsconfig's noUnusedParameters honours);
      // teach the lint rule the same convention instead of duplicating it.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    // Tests stub third-party shapes (quais contracts, supabase query chains)
    // where writing the full type buys no safety and obscures the fixture.
    files: ['**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
])
