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

  /**
   * 22-design-system.md Rule 1 — tokens only. A hex literal or an arbitrary Tailwind value
   * inside a component means the design system has been bypassed, and it is invisible in
   * review once there are a hundred components.
   */
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]',
          message:
            'No hex literals in components (22-design-system.md Rule 1). Use a semantic token from globals.css.',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]',
          message:
            'No hex literals in components (22-design-system.md Rule 1). Use a semantic token from globals.css.',
        },
        {
          // Arbitrary *values* — `text-[#162839]`, `p-[13px]`, `w-[42rem]`.
          //
          // Not arbitrary *variants*: `data-[state=checked]:`, `aria-[…]:`, `has-[…]:`,
          // `min-[…]:` are selectors, not values, and Radix state styling is written with
          // them. The negative lookahead for `:` is what separates the two.
          selector: 'Literal[value=/(^|\\s)[a-z-]+-\\[[^\\]]+\\](?!:)/]',
          message:
            'No arbitrary Tailwind values in components (22-design-system.md Rule 1). Add a token instead.',
        },
      ],
    },
  },

  /**
   * `I18N-01` — no hardcoded user-facing string. Enforced on the two trees that render to
   * users. `allowedStrings` covers punctuation that is not language.
   */
  {
    files: ['src/app/**/*.tsx', 'src/components/**/*.tsx'],
    rules: {
      'react/jsx-no-literals': [
        'error',
        {
          noStrings: true,
          ignoreProps: true,
          allowedStrings: ['·', '—', '–', '/', '×', ':', '|'],
        },
      ],
    },
  },

  /**
   * `/dev/*` is a development-only surface (token sheet, UI gallery), gated behind
   * `APP_ENV !== 'production'`. Its labels are token names, variant names and sample data
   * that must render verbatim — translating "primary" or "#162839" would defeat the point
   * of the page. Narrow, deliberate, and the only exception in the config.
   */
  {
    files: ['src/app/**/dev/**/*.tsx'],
    rules: {
      'react/jsx-no-literals': 'off',
    },
  },

  // Must come last: turns off every rule that would fight Prettier.
  eslintConfigPrettier,
)
