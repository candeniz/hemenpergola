import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { FlatCompat } from '@eslint/eslintrc'
import eslintConfigPrettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

const __dirname = dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({ baseDirectory: __dirname })

/** Committed reference material, never linted and never imported (CLAUDE.md §Layout). */
const REFERENCE_DIRS = ['Frontend Tasarım/**', 'Yazılım Mimari Promptlar/**', 'Prompt/**']

/**
 * The only files allowed to touch `process.env` directly. `instrumentation.ts` is on the
 * list because it must branch on `NEXT_RUNTIME` *before* the typed env exists — it is the
 * hook that creates it.
 */
const ENV_BOUNDARY_FILES = [
  'src/shared/config/env.ts',
  'src/shared/config/env.client.ts',
  'src/shared/config/env.test.ts',
  'src/instrumentation.ts',
  'vitest.config.ts',
]

export default tseslint.config(
  {
    ignores: ['node_modules/**', '.next/**', 'next-env.d.ts', 'coverage/**', ...REFERENCE_DIRS],
  },

  ...compat.extends('next/core-web-vitals'),
  ...tseslint.configs.recommended,

  {
    rules: {
      // CLAUDE.md §Conventions: no `any`; `unknown` plus a Zod parse at boundaries.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // Configuration is read once, in one place, and it is typed
      // (23-deployment-and-environments.md §Configuration).
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            'Read configuration through src/shared/config/env.ts (or env.client.ts in the browser), never process.env directly.',
        },
      ],
    },
  },

  {
    files: ENV_BOUNDARY_FILES,
    rules: { 'no-restricted-syntax': 'off' },
  },

  // Must come last: turns off every rule that would fight Prettier.
  eslintConfigPrettier,
)
