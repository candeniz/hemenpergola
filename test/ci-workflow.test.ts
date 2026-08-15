import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

/**
 * `23-deployment-and-environments.md` §Pipeline and `20-testing-strategy.md` §Pipeline both
 * specify the stage order. This test pins the workflow to it, so reordering or dropping a
 * stage is a failing test rather than a quiet edit to a YAML file nobody re-reads.
 *
 * It cannot prove the workflow runs on GitHub — only GitHub can — but it does prove the
 * shape is the documented one.
 */
const workflow = parse(
  readFileSync(fileURLToPath(new URL('../.github/workflows/ci.yml', import.meta.url)), 'utf8'),
) as {
  name: string
  concurrency?: { group: string; 'cancel-in-progress': boolean }
  jobs: Record<
    string,
    {
      needs?: string | string[]
      steps: { name?: string; run?: string; uses?: string; with?: Record<string, unknown> }[]
    }
  >
}

const dependsOn = (job: string): string[] => {
  const needs = workflow.jobs[job]?.needs
  return needs === undefined ? [] : Array.isArray(needs) ? needs : [needs]
}

describe('CI workflow', () => {
  it('runs the documented stages, in the documented order', () => {
    // lint+typecheck → unit → integration → build → e2e → a11y + Lighthouse
    expect(Object.keys(workflow.jobs)).toEqual([
      'static',
      'unit',
      'integration',
      'build',
      'e2e',
      'lighthouse',
    ])

    expect(dependsOn('static')).toEqual([])
    expect(dependsOn('unit')).toEqual(['static'])
    expect(dependsOn('integration')).toEqual(['unit'])
    expect(dependsOn('build')).toEqual(['integration'])
    expect(dependsOn('e2e')).toEqual(['build'])
    expect(dependsOn('lighthouse')).toEqual(['build'])
  })

  it('cancels superseded runs of the same ref', () => {
    expect(workflow.concurrency?.['cancel-in-progress']).toBe(true)
  })

  it('pins Node and pnpm to the versions this repository declares', () => {
    for (const [id, job] of Object.entries(workflow.jobs)) {
      const setupNode = job.steps.find((step) => step.uses?.startsWith('actions/setup-node'))
      expect(setupNode, `${id} must set up Node`).toBeDefined()
      // .nvmrc, not a literal — one source of truth with the developer machine.
      expect(setupNode?.with?.['node-version-file']).toBe('.nvmrc')
      expect(setupNode?.with?.cache).toBe('pnpm')

      expect(
        job.steps.some((step) => step.uses?.startsWith('pnpm/action-setup')),
        `${id} must set up pnpm`,
      ).toBe(true)
    }
  })

  it('installs from the lockfile, never resolving fresh', () => {
    for (const [id, job] of Object.entries(workflow.jobs)) {
      expect(
        job.steps.some((step) => step.run?.includes('--frozen-lockfile')),
        `${id} must use --frozen-lockfile`,
      ).toBe(true)
    }
  })

  it('keeps secrets out of the build and gives them only to the server that needs them', () => {
    // `pnpm build` needs no configuration since the env parse moved to instrumentation.ts
    // (23 §Configuration). If a .env appears in the build job, that has regressed.
    const build = workflow.jobs.build!
    expect(build.steps.some((step) => step.run?.includes('.env'))).toBe(false)

    // `next start` does need it, so e2e writes one from the committed example.
    const e2e = workflow.jobs.e2e!
    expect(e2e.steps.some((step) => step.run === 'cp .env.example .env')).toBe(true)
  })

  it('asserts the release gate still exists', () => {
    const guard = workflow.jobs.static!.steps.find((step) =>
      step.run?.includes('ci-release-gate.mjs'),
    )
    expect(guard, 'static must run the release-gate guard').toBeDefined()
  })

  it('does not deploy — there is no environment to deploy to yet', () => {
    const everyRun = Object.values(workflow.jobs)
      .flatMap((job) => job.steps)
      .map((step) => step.run ?? '')
      .join('\n')

    expect(everyRun).not.toMatch(/deploy|staging|smoke/i)
  })
})
