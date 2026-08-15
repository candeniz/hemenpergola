import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { FlatCompat } from '@eslint/eslintrc'
import eslintConfigPrettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

const __dirname = dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({ baseDirectory: __dirname })

/**
 * The raw palette names, read out of `globals.css` at lint time.
 *
 * `globals.css` holds two `@theme` blocks: the raw roles first, the semantic aliases
 * second (22-design-system.md §Tokens). Generating the list here rather than hard-coding
 * it means adding a palette entry automatically bans it at call sites, and promoting one
 * to a semantic alias automatically allows it — the rule cannot drift from the stylesheet.
 */
function rawPaletteTokens() {
  const css = readFileSync(join(__dirname, 'src/app/[locale]/globals.css'), 'utf8')
  const starts = [...css.matchAll(/@theme\s*\{/g)].map((match) => match.index)

  if (starts.length < 2) {
    throw new Error(`Expected two @theme blocks in globals.css, found ${starts.length}`)
  }

  const names = (chunk) => [...chunk.matchAll(/--color-([a-z0-9-]+):/g)].map((match) => match[1])
  const semantic = new Set(names(css.slice(starts[1])))

  return names(css.slice(starts[0], starts[1]))
    .filter((name) => !semantic.has(name))
    .sort((a, b) => b.length - a.length) // longest first, so prefixes do not shadow
}

const COLOUR_UTILITIES = [
  'bg',
  'text',
  'border',
  'ring',
  'fill',
  'stroke',
  'divide',
  'outline',
  'from',
  'via',
  'to',
  'shadow',
  'accent',
  'caret',
  'decoration',
  'placeholder',
]

const RAW_TOKEN_PATTERN = `(?:^|["'\\s:])(?:[a-z0-9-]+(?:\\[[^\\]]*\\])?:)*(?:${COLOUR_UTILITIES.join('|')})-(?:${rawPaletteTokens().join('|')})(?![a-z0-9-])`

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
  // Test tooling, not application code: Playwright reads `CI` to decide retries and
  // workers, and it runs before — and outside — the app's typed configuration.
  'playwright.config.ts',
  'e2e/**/*.ts',
  // The integration harness must hand the container's URL to the Prisma CLI as an env
  // var; the typed env describes the application's database, not an ephemeral one.
  'test/integration/**/*.ts',
]

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'next-env.d.ts',
      'coverage/**',
      // A deliberate boundary violation, linted on purpose by test/module-boundary.test.ts.
      'test/fixtures/boundary/**',
      ...REFERENCE_DIRS,
    ],
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
   * The module boundary (`05-system-architecture.md` §Shape, `CLAUDE.md` non-negotiable 2).
   *
   * `app/` is presentation. It may call application services and nothing below them: no
   * Prisma, no repositories, no domain internals. The rule exists because the violation is
   * invisible in review — a page that queries the database directly looks perfectly normal
   * and skips every permission assertion in `12` §Authorization.
   *
   * Proven by `test/module-boundary.test.ts`, which lints a committed fixture and expects
   * the error. A rule nobody has watched fail is decoration.
   */
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              message:
                'No Prisma in app/. Pages, layouts, server actions and route handlers call application services only (05-system-architecture.md §Shape).',
            },
          ],
          patterns: [
            {
              group: ['@/shared/db', '@/shared/db/*', '**/shared/db', '**/shared/db/*'],
              message:
                'No database client in app/. Call an application service (05-system-architecture.md §Shape).',
            },
            {
              /*
               * CLAUDE.md non-negotiable 9. Next evaluates a route's module graph while
               * collecting page data — at build time — so a *static* import of anything
               * that reads `env` or builds the Prisma client at module load makes
               * `pnpm build` need production secrets again.
               *
               * `env.client.ts` is not here: its values are `NEXT_PUBLIC_*`, which Next
               * inlines at build time, so evaluating it during the build is correct.
               *
               * The fix at a call site is `await import(...)` inside the handler or the
               * component, not an exception to this rule.
               */
              group: [
                '@/shared/config/env',
                '**/shared/config/env',
                '@/modules/*/application/*',
                '@/modules/*/application/**',
                '**/modules/*/application/*',
                '**/modules/*/application/**',
              ],
              message:
                'Do not import configuration or an application service at module scope in app/ — Next evaluates it at build time and the build stops being secret-free (CLAUDE.md non-negotiable 9). Use `await import(...)` inside the handler instead.',
            },
            {
              group: ['@/modules/*/infrastructure/**', '**/modules/*/infrastructure/**'],
              message:
                'No repository or adapter in app/. Call the module’s application service instead.',
            },
            {
              group: ['@/modules/*/domain/**', '**/modules/*/domain/**'],
              message:
                'No domain internals in app/. The application layer is the only entry point (05-system-architecture.md §Shape).',
            },
          ],
        },
      ],
    },
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
          // 22 §Semantic mapping: call sites use semantic names. A raw role name means the
          // semantic layer has a gap — the fix is to add an alias, not to reach past it.
          // This is what caught `hover:bg-on-error-container`: a foreground role used as a
          // background, which reads fine and is wrong.
          selector: `Literal[value=/${RAW_TOKEN_PATTERN}/]`,
          message:
            'No raw palette names in components (22-design-system.md §Semantic mapping). Use a semantic alias, or add one to globals.css if none fits.',
        },
        {
          selector: `TemplateElement[value.raw=/${RAW_TOKEN_PATTERN}/]`,
          message:
            'No raw palette names in components (22-design-system.md §Semantic mapping). Use a semantic alias, or add one to globals.css if none fits.',
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
