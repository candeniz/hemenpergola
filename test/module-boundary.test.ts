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

/**
 * Lint the fixture *as if* it lived under `src/app`, which is where the rule applies. The
 * fixture cannot actually live there — it would be a route and it imports modules that do
 * not exist yet — so its path is overridden for the lint run.
 */
// One instance for the file: constructing ESLint loads the whole flat config, which takes
// several seconds, and doing it per test makes the suite look flaky when it is only slow.
const eslint = new ESLint({ cwd: process.cwd() })

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
    const boundary = messages.filter((message) => message.ruleId === 'no-restricted-imports')

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
    const boundary = messages.filter((message) => message.ruleId === 'no-restricted-imports')

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

    expect(messages.filter((message) => message.ruleId === 'no-restricted-imports')).toEqual([])
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
      (results[0]?.messages ?? []).filter((message) => message.ruleId === 'no-restricted-imports'),
    ).toEqual([])
  })
})
