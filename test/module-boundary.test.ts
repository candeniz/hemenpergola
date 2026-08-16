import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { describe, expect, it, vi } from 'vitest'

/**
 * Proves the module boundary rule fires (task 0.8, `26-execution-plan.md`: *"a boundary
 * rule that is not proven by a failing fixture is decoration"*).
 *
 * `26` suggests a committed fixture that fails CI on purpose. A permanently-red pipeline
 * gets ignored within a week, so the fixture is committed and the *test* asserts the
 * failure instead: the rule is proven, and CI stays green while it is obeyed.
 */
const FIXTURE = fileURLToPath(
  new URL('./fixtures/boundary/app-imports-prisma.tsx', import.meta.url),
)
const fixtureSource = readFileSync(FIXTURE, 'utf8')

const BUILD_TIME_FIXTURE = fileURLToPath(
  new URL('./fixtures/boundary/app-imports-env-at-module-scope.tsx', import.meta.url),
)
const buildTimeFixtureSource = readFileSync(BUILD_TIME_FIXTURE, 'utf8')

const DYNAMIC_FIXTURE = fileURLToPath(
  new URL('./fixtures/boundary/app-imports-layers-dynamically.tsx', import.meta.url),
)
const dynamicFixtureSource = readFileSync(DYNAMIC_FIXTURE, 'utf8')

/**
 * Lint the fixture *as if* it lived under `src/app`, which is where the rule applies. The
 * fixture cannot actually live there — it would be a route and it imports modules that do
 * not exist yet — so its path is overridden for the lint run.
 */
// One instance for the file: constructing ESLint loads the whole flat config, which takes
// several seconds, and doing it per test makes the suite look flaky when it is only slow.
const eslint = new ESLint({ cwd: process.cwd() })

/**
 * The rule id moved when rule 9 was narrowed: only `@typescript-eslint/no-restricted-imports`
 * understands `allowTypeImports`, and a type-only import must pass. Both ids are accepted so
 * this helper keeps telling the truth if the config ever moves back.
 */
function isBoundaryRule(ruleId: string | null): boolean {
  return ruleId === 'no-restricted-imports' || ruleId === '@typescript-eslint/no-restricted-imports'
}

/**
 * The dynamic half of the layering bans is a `no-restricted-syntax` rule, because no
 * import-based rule can see an `ImportExpression`. Kept separate from `isBoundaryRule` so a
 * test asserting "the static rule fired" cannot be satisfied by the dynamic one, or the two
 * halves would stop being independently provable.
 */
function isDynamicBoundaryRule(ruleId: string | null): boolean {
  return ruleId === 'no-restricted-syntax'
}

async function lintAsAppFile(source: string) {
  const results = await eslint.lintText(source, {
    filePath: fileURLToPath(new URL('../src/app/[locale]/__boundary-probe.tsx', import.meta.url)),
  })
  return results[0]?.messages ?? []
}

// ESLint config loading dominates: give the file room rather than tuning it globally.
vi.setConfig({ testTimeout: 30_000 })

describe('module boundary: app/ may only call application services', () => {
  it('reports every forbidden import in the fixture', async () => {
    const messages = await lintAsAppFile(fixtureSource)
    const boundary = messages.filter((message) => isBoundaryRule(message.ruleId))

    // Four violations, one per layer the fixture reaches into.
    expect(boundary).toHaveLength(4)
    expect(boundary.every((message) => message.severity === 2)).toBe(true)
  })

  it.each([
    ['@prisma/client', /No Prisma in app/],
    ['@/shared/db', /No database client in app/],
    ['@/modules/iam/infrastructure/company-repository', /No repository or adapter in app/],
    ['@/modules/iam/domain/permissions', /No domain internals in app/],
  ])('bans %s', async (specifier, expectedMessage) => {
    const messages = await lintAsAppFile(
      `import x from '${specifier}'\nexport default function Page() { return x }\n`,
    )
    const boundary = messages.filter((message) => isBoundaryRule(message.ruleId))

    expect(boundary).toHaveLength(1)
    expect(boundary[0]?.message).toMatch(expectedMessage)
  })

  it('allows the imports app/ is supposed to use', async () => {
    const messages = await lintAsAppFile(
      [
        "import { getTranslations } from 'next-intl/server'",
        "import { Button } from '@/components/ui/button'",
        "import { anonymousActor } from '@/shared/context/actor'",
        'export default function Page() { return { getTranslations, Button, anonymousActor } }',
      ].join('\n'),
    )

    expect(messages.filter((message) => isBoundaryRule(message.ruleId))).toEqual([])
  })

  it('does not apply the rule outside app/ — infrastructure is where Prisma belongs', async () => {
    const results = await eslint.lintText(
      "import { prisma } from '@/shared/db'\nexport const x = prisma\n",
      {
        filePath: fileURLToPath(
          new URL('../src/modules/iam/infrastructure/probe-repository.ts', import.meta.url),
        ),
      },
    )

    expect(
      (results[0]?.messages ?? []).filter((message) => isBoundaryRule(message.ruleId)),
    ).toEqual([])
  })
})

/**
 * CLAUDE.md non-negotiable 9. This is the rule that exists because the bug shipped twice —
 * once in the `/dev` layout, once in `/api/health` — and both times it was invisible
 * locally, because a developer always has a `.env`.
 */
describe('build-time coupling: app/ must not read config or services at module scope', () => {
  it('reports both imports in the fixture', async () => {
    const messages = await lintAsAppFile(buildTimeFixtureSource)
    const boundary = messages.filter((message) => isBoundaryRule(message.ruleId))

    expect(boundary).toHaveLength(2)
    expect(boundary.every((message) => /module scope/.test(message.message))).toBe(true)
  })

  it.each([
    ['@/shared/config/env', 'the typed env'],
    ['@/modules/platform/application/health-service', 'an application service'],
    ['@/modules/iam/application/company-service', 'any application service'],
  ])('bans a static import of %s', async (specifier) => {
    const messages = await lintAsAppFile(
      `import x from '${specifier}'\nexport default function Page() { return x }\n`,
    )

    expect(messages.filter((m) => isBoundaryRule(m.ruleId))).toHaveLength(1)
  })

  it('allows the dynamic import that is the actual fix', async () => {
    // Exactly what /api/health and the /dev layout do now.
    const messages = await lintAsAppFile(
      [
        'export default async function handler() {',
        "  const { checkHealth } = await import('@/modules/platform/application/health-service')",
        '  return checkHealth()',
        '}',
      ].join('\n'),
    )

    expect(messages.filter((m) => isBoundaryRule(m.ruleId))).toEqual([])
  })

  it('allows env.client, whose values Next inlines at build time anyway', async () => {
    const messages = await lintAsAppFile(
      "import { clientEnv } from '@/shared/config/env.client'\nexport default function Page() { return clientEnv }\n",
    )

    expect(messages.filter((m) => isBoundaryRule(m.ruleId))).toEqual([])
  })

  it('does not apply outside app/ — instrumentation.ts must import env at module scope', async () => {
    const results = await eslint.lintText(
      "import { env } from '@/shared/config/env'\nexport const x = env\n",
      { filePath: fileURLToPath(new URL('../src/instrumentation.ts', import.meta.url)) },
    )

    expect((results[0]?.messages ?? []).filter((m) => isBoundaryRule(m.ruleId))).toEqual([])
  })
})

/**
 * Phase 1 gives the boundary rule its first real targets. Before `modules/iam` existed the
 * patterns matched nothing that was actually there.
 */
describe('the rule protects the iam module specifically', () => {
  const iamFixture = readFileSync(
    fileURLToPath(new URL('./fixtures/boundary/app-imports-iam-internals.tsx', import.meta.url)),
    'utf8',
  )

  it('reports all three real internals the fixture reaches for', async () => {
    const messages = await lintAsAppFile(iamFixture)
    const boundary = messages.filter((message) => isBoundaryRule(message.ruleId))

    expect(boundary).toHaveLength(3)
  })

  it.each([
    ['@/modules/iam/infrastructure/identify', /repository or adapter/],
    ['@/modules/iam/infrastructure/password-hasher', /repository or adapter/],
    ['@/modules/iam/domain/permissions', /domain internals/],
  ])('bans %s from app/', async (specifier, expected) => {
    const messages = await lintAsAppFile(
      `import x from '${specifier}'\nexport default function Page() { return x }\n`,
    )
    const boundary = messages.filter((m) => isBoundaryRule(m.ruleId))

    expect(boundary).toHaveLength(1)
    expect(boundary[0]?.message).toMatch(expected)
  })

  it('still allows the application layer — dynamically imported, per rule 9', async () => {
    const messages = await lintAsAppFile(
      [
        'export default async function handler() {',
        "  const { login } = await import('@/modules/iam/application/auth-service')",
        '  return login',
        '}',
      ].join('\n'),
    )

    expect(messages.filter((m) => isBoundaryRule(m.ruleId))).toEqual([])
  })
})

/**
 * The distinction the rule actually rests on: **static** import versus **dynamic** import.
 *
 * These two fixtures are the same server action written twice. Only one of them is a bug,
 * and until both were committed the rule was only ever proven in one direction — which is
 * how the `actions.ts` version shipped: the file had been moved into `app/`, and moving it
 * changed nothing, because the static import chain still dragged `auth-service` into the
 * page's build-time module graph.
 */
describe('server actions: the same file, static and dynamic', () => {
  const staticFixture = readFileSync(
    fileURLToPath(new URL('./fixtures/boundary/app-action-static-import.ts', import.meta.url)),
    'utf8',
  )
  const dynamicFixture = readFileSync(
    fileURLToPath(new URL('./fixtures/boundary/app-action-dynamic-import.ts', import.meta.url)),
    'utf8',
  )

  it('rejects the static version — both imports, even inside app/', async () => {
    const messages = await lintAsAppFile(staticFixture)
    const boundary = messages.filter((m) => isBoundaryRule(m.ruleId))

    // `auth-service` and `dto`: two application-layer modules, two errors.
    expect(boundary).toHaveLength(2)
    expect(boundary.every((m) => /module scope/.test(m.message))).toBe(true)
  })

  it('accepts the dynamic version, type import and all', async () => {
    const messages = await lintAsAppFile(dynamicFixture)

    expect(messages.filter((m) => isBoundaryRule(m.ruleId))).toEqual([])
  })

  it('accepts `import type` from an application service on its own', async () => {
    // The narrowing that made `app/actions/auth.ts` possible to type. Erased at compile
    // time, so it is in neither the module graph nor the bundle.
    const messages = await lintAsAppFile(
      [
        "import type { AuthTokens } from '@/modules/iam/application/auth-service'",
        'export default function Page(): AuthTokens | null { return null }',
      ].join('\n'),
    )

    expect(messages.filter((m) => isBoundaryRule(m.ruleId))).toEqual([])
  })

  it('still rejects the value import of the very same module', async () => {
    // The pair that makes the previous test mean something.
    const messages = await lintAsAppFile(
      [
        "import { login } from '@/modules/iam/application/auth-service'",
        'export default function Page() { return login }',
      ].join('\n'),
    )

    expect(messages.filter((m) => isBoundaryRule(m.ruleId))).toHaveLength(1)
  })

  it('does not let `import type` through the layers that are not about build time', async () => {
    /*
     * `allowTypeImports` is on the rule-9 group only. The domain and infrastructure bans are
     * architectural — `05` §Shape — and erasure has nothing to do with why they exist: a
     * page that knows the shape of a repository row is coupled to it whether or not the
     * import survives compilation.
     */
    const messages = await lintAsAppFile(
      [
        "import type { Permission } from '@/modules/iam/domain/permissions'",
        'export default function Page(): Permission | null { return null }',
      ].join('\n'),
    )

    expect(messages.filter((m) => isBoundaryRule(m.ruleId))).toHaveLength(1)
  })
})

/**
 * The gap Q21 closed.
 *
 * `no-restricted-imports` sees static `import` declarations and nothing else, so
 * `await import('@/shared/db')` inside `app/` passed the pipeline for three phases. Four real
 * violations were living behind that shape when the rule was finally written.
 *
 * Both directions are asserted here, and both matter:
 *
 *   a **layering** ban must fire whether the import is static or dynamic — deferring *when*
 *   the layer is crossed does not stop it being crossed;
 *
 *   **non-negotiable 9** must *not*, because there the dynamic import is the prescribed fix.
 *   A rule that banned both would leave no legal way to call a service from a route handler.
 */
describe('layering bans catch dynamic imports too', () => {
  it('reports all four in the dynamic fixture', async () => {
    const messages = await lintAsAppFile(dynamicFixtureSource)
    const dynamic = messages.filter((message) => isDynamicBoundaryRule(message.ruleId))

    expect(dynamic).toHaveLength(4)
    expect(dynamic.every((message) => message.severity === 2)).toBe(true)
    // The message says so, because a developer who hits this needs to know that moving the
    // import back to the top is not the fix.
    expect(dynamic.every((message) => /statically or dynamically/.test(message.message))).toBe(true)
  })

  it.each([
    ['@prisma/client', /No Prisma in app/],
    ['@/shared/db', /No database client in app/],
    ['@/modules/iam/infrastructure/company-repository', /No repository or adapter in app/],
    ['@/modules/iam/domain/permissions', /No domain internals in app/],
  ])('bans a dynamic import of %s', async (specifier, expectedMessage) => {
    const messages = await lintAsAppFile(
      `export default async function Page() { return await import('${specifier}') }\n`,
    )
    const dynamic = messages.filter((message) => isDynamicBoundaryRule(message.ruleId))

    expect(dynamic).toHaveLength(1)
    expect(dynamic[0]?.message).toMatch(expectedMessage)
  })

  it.each([
    ['@prisma/client'],
    ['@/shared/db'],
    ['@/modules/iam/infrastructure/company-repository'],
    ['@/modules/iam/domain/permissions'],
  ])('still bans a static import of %s — the original half did not regress', async (specifier) => {
    const messages = await lintAsAppFile(
      `import x from '${specifier}'\nexport default function Page() { return x }\n`,
    )

    expect(messages.filter((message) => isBoundaryRule(message.ruleId))).toHaveLength(1)
  })

  it.each([
    ['@/shared/config/env'],
    ['@/modules/platform/application/health-service'],
    ['@/modules/iam/application/company-service'],
  ])('leaves a dynamic import of %s alone — that is non-negotiable 9’s fix', async (specifier) => {
    /*
     * The assertion that keeps the two rules honest about their different purposes. Every
     * server action and route handler in this codebase is built this way; if this ever fails,
     * the dynamic ban has been widened past layering into timing and the whole app/ layer
     * has no legal way to reach a service.
     */
    const messages = await lintAsAppFile(
      `export default async function Page() { return await import('${specifier}') }\n`,
    )

    expect(messages.filter((message) => isDynamicBoundaryRule(message.ruleId))).toEqual([])
    expect(messages.filter((message) => isBoundaryRule(message.ruleId))).toEqual([])
  })

  it('does not apply outside app/ — a service may import its own infrastructure', async () => {
    const results = await eslint.lintText(
      "export async function load() { return await import('@/shared/db') }\n",
      {
        filePath: fileURLToPath(
          new URL('../src/modules/iam/application/probe-service.ts', import.meta.url),
        ),
      },
    )

    expect(
      (results[0]?.messages ?? []).filter((message) => isDynamicBoundaryRule(message.ruleId)),
    ).toEqual([])
  })
})
