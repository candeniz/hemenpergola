import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { FlatCompat } from '@eslint/eslintrc'
import eslintConfigPrettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

import { REFERENCE_DIRS as SHARED_REFERENCE_DIRS } from './reference-dirs.mjs'

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

/**
 * `no-restricted-imports` only sees **static** `import` declarations. `await import('...')`
 * is an `ImportExpression` and slips straight past it — which is how
 * `hizmet-bolgeleri/page.tsx` called `prisma.city.findMany` from `app/` for a whole phase
 * without the pipeline noticing.
 *
 * The distinction that matters, and the reason this is not simply "ban dynamic imports too":
 *
 *   **Non-negotiable 9 is about *timing*.** It bans evaluating `env` or an application
 *   service at *module scope*, because Next walks the module graph at build time. A dynamic
 *   import is the **prescribed fix** there — the module is evaluated when the request runs.
 *   Those specifiers must stay dynamically importable.
 *
 *   **The layering rules are about *dependency*.** `app/` may not reach Prisma, a
 *   repository or a domain internal — and deferring *when* it reaches them changes nothing.
 *   A dynamic import there is the same violation, merely invisible.
 *
 * So the layering groups get a syntax rule as well, and the timing group does not.
 *
 * Matches `import('x')` and `await import('x')` with a literal specifier. A computed
 * specifier (`import(someVariable)`) is not matched and cannot be — that is a documented
 * hole, and one nobody reaches by accident.
 */
function bannedDynamicImport(patterns, message) {
  const alternatives = patterns
    .map((pattern) => pattern.replaceAll('/', '\\/').replaceAll('*', '[^\'"]*'))
    .join('|')

  return {
    selector: `ImportExpression > Literal[value=/^(?:${alternatives})$/]`,
    message,
  }
}

/** The layering bans, as dynamic-import selectors. Shared by the config and its fixtures. */
export const DYNAMIC_LAYERING_BANS = [
  bannedDynamicImport(
    ['@prisma/client'],
    'No Prisma in app/, statically or dynamically. Pages, layouts, server actions and route handlers call application services only (05-system-architecture.md §Shape). Deferring the import defers nothing: the layer is still crossed.',
  ),
  bannedDynamicImport(
    ['@/shared/db', '@/shared/db/*', '**/shared/db', '**/shared/db/*'],
    'No database client in app/, statically or dynamically. Call an application service (05-system-architecture.md §Shape).',
  ),
  bannedDynamicImport(
    ['@/modules/*/infrastructure/**', '**/modules/*/infrastructure/**'],
    'No repository or adapter in app/, statically or dynamically. Call the module’s application service instead.',
  ),
  bannedDynamicImport(
    ['@/modules/*/domain/**', '**/modules/*/domain/**'],
    'No domain internals in app/, statically or dynamically. The application layer is the only entry point (05-system-architecture.md §Shape).',
  ),
]

/**
 * Committed reference material, never linted and never imported (CLAUDE.md §Layout).
 * The names come from the shared list (ADR-029); the `/**` shape is this config's own.
 */
const REFERENCE_DIRS = SHARED_REFERENCE_DIRS.map((dir) => `${dir}/**`)

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
  // The site origin for canonical/sitemap/JSON-LD (task 8.4). Deliberately NOT the typed
  // env: that parse is eager and this value is read while `next build` prerenders public
  // pages, where `23` §Configuration guarantees no environment exists. A soft read with a
  // dev fallback — the file's comment carries the full argument.
  'src/shared/seo/site-url.ts',
  // The CSP's storage origin (task 13.4), and since 13.5 its NODE_ENV branch too. This
  // runs in the Edge runtime on every request; the typed env parses the WHOLE environment
  // and throws on the first missing secret, so importing it here would turn an unrelated
  // config typo into a site-wide outage. `S3_ENDPOINT`/`CDN_BASE_URL` are public
  // hostnames, and the file's own comment carries the argument — the same one
  // `next.config.ts` makes one line below.
  'src/shared/security/csp.ts',
  // The build configuration. `images.remotePatterns` needs the CDN host at build time, and
  // the typed env cannot be used here: it parses the *whole* environment and throws on the
  // first missing secret, which is precisely the build-needs-production-secrets failure
  // `23` §Configuration removed. `CDN_BASE_URL` is a public hostname, and an unset one falls
  // back rather than failing — see the comment in the file.
  'next.config.ts',
  // The Lighthouse stage: a CLI script like the other ci-*.mjs runners — it targets an
  // arbitrary stack (LH_BASE_URL/DATABASE_URL) that the application's typed env does not
  // describe. Structural, not a src/ decision (the pin test covers src/** only).
  'scripts/ci-lighthouse.mjs',
  // The load-test runner: same class — a CLI targeting an arbitrary stack.
  'scripts/load-test-matching.ts',
  // The tunnel launcher (Faz 13.3): it *composes* the environment it hands to the web and
  // worker children, which is the opposite of reading configuration — the typed env is
  // what those children then parse at their own startup. It also runs before any of them
  // exists, so there is nothing typed to read.
  'scripts/tunnel.mjs',
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
      // The Expo app lints under its own flat config (eslint-config-expo) — the RN and web
      // environments disagree about globals, JSX runtime and import resolution.
      'mobile/**',
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

      // The same four layering bans again, this time for `await import(...)` — see
      // `bannedDynamicImport` above for why non-negotiable 9's group is deliberately absent
      // from this list.
      'no-restricted-syntax': ['error', ...DYNAMIC_LAYERING_BANS],
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
