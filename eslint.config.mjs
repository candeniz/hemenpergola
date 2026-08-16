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
  // Prisma CLI tooling and the seed runner: both must run against an arbitrary database
  // (a container, a scratch copy) that the application's typed configuration does not
  // describe, and both execute outside Next entirely.
  'prisma.config.ts',
  'prisma/seed/**/*.ts',
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
      // The base rule is off; the typescript-eslint version is used because only it can say
      // `allowTypeImports`, and a type-only import is erased before the bundler ever sees
      // it — see the rule-9 group below.
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
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
               * CLAUDE.md non-negotiable 9.
               *
               * What is banned is **module-scope evaluation**, not the dependency. Next
               * walks a route's module graph while collecting page data — at build time —
               * so a *static* import of anything that reads `env` or builds the Prisma
               * client at module load makes `pnpm build` need production secrets again.
               *
               * Two things are therefore deliberately allowed, and a fixture in
               * `test/module-boundary.test.ts` proves each:
               *
               *   `await import(...)` inside a handler, a component or a server action —
               *   the module is evaluated when the request runs, which is the point.
               *
               *   `import type` — erased by the compiler, so it reaches neither the module
               *   graph nor the bundle. That is what `allowTypeImports` below is for.
               *
               * It applies transitively: a file in app/ that statically imports a *second*
               * app/ file which statically imports a service is the same bug one step
               * further away. That is why the server actions in `app/actions/` reach their
               * service through `await import(...)` even though they already live in app/.
               *
               * `env.client.ts` is not in the group: its values are `NEXT_PUBLIC_*`, which
               * Next inlines at build time, so evaluating it during the build is correct.
               */
              group: [
                '@/shared/config/env',
                '**/shared/config/env',
                '@/modules/*/application/*',
                '@/modules/*/application/**',
                '**/modules/*/application/*',
                '**/modules/*/application/**',
              ],
              // Types are erased, so a type-only import cannot cause the evaluation this
              // rule exists to prevent.
              allowTypeImports: true,
              message:
                'Do not evaluate configuration or an application service at module scope in app/ — Next walks the module graph at build time and the build stops being secret-free (CLAUDE.md non-negotiable 9). Use `await import(...)` inside the handler, or `import type` if only the type is needed.',
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
        {
          /*
           * `max-w-md` and its family — a class that is neither a hex literal nor an
           * arbitrary value, and is wrong anyway.
           *
           * This theme defines a custom spacing scale with `sm`/`md`/`lg`/`xl`, and in
           * Tailwind 4 a `max-w-*` utility resolves against the container **and** the
           * spacing namespaces, with spacing winning. So `max-w-md` in this project means
           * 24 pixels, not 28rem — and a card carrying it becomes a 24-pixel column with no
           * error, no warning and a perfectly normal-looking class name. It shipped twice:
           * in `ui/dialog.tsx` from Phase 0, and in the auth card here in Phase 1.
           *
           * Named container tokens (`max-w-page`, `max-w-form`, `max-w-dialog`) do not
           * collide, because no spacing token shares their names.
           */
          selector:
            'Literal[value=/(^|\\s)(max-)?[wh]-(xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl)(\\s|$)/]',
          message:
            'A `max-w-md`-style class resolves to this theme’s *spacing* scale, not a container width — `max-w-md` is 24px here. Use a named container token (max-w-page, max-w-form, max-w-dialog) or add one to globals.css.',
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
