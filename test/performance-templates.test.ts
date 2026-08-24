import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// The canonical machine-readable source the CI stage runs against.
import { BUDGETS, TEMPLATES, THROTTLING } from '../scripts/performance-budget.mjs'

/**
 * The phase gate's falsifiability — Phase 8. `21` says "five main templates meet the
 * budgets"; `18` §Performance budgets NAMES the five and points at
 * `scripts/performance-budget.mjs` as the machine-readable source. This test is the weld:
 * the document's table and the module `ci-lighthouse.mjs` executes must name the same
 * templates and the same numbers, or the gate and its documentation have drifted apart.
 */
describe('performance gate · doc and module agree', () => {
  const doc = readFileSync(join(process.cwd(), 'Yazılım Mimari Promptlar', '18-cms-seo.md'), 'utf8')

  it('the five templates in 18 are exactly the module’s', () => {
    // The doc's template table rows: | n | Name | `route` |
    const section =
      /\*\*The five main templates\*\*[\s\S]*?Canonical machine-readable/.exec(doc)?.[0] ?? ''
    const routes = [...section.matchAll(/\|\s*\d\s*\|[^|]+\|\s*`([^`]+)`\s*\|/g)].map(
      (match) => match[1],
    )

    expect(routes).toEqual([
      '/',
      '/kategoriler/[slug]',
      '/urunler/[slug]',
      '/ureticiler/[slug]',
      '/sehirler/[slug]',
    ])
    expect(TEMPLATES).toHaveLength(routes.length)

    // Each module template's path shape matches the doc's route pattern. 'slug' survives
    // the city template's slugify unchanged, so the substitution works for all five.
    expect(TEMPLATES[0]?.path()).toBe('/')
    const shapes = TEMPLATES.slice(1).map((template) =>
      template.path('slug').replace('slug', '[slug]'),
    )
    expect(shapes).toEqual(routes.slice(1))
  })

  it('the budget numbers in 18 are the module’s', () => {
    expect(doc).toContain(`LCP | ≤ ${BUDGETS.lcpSeconds.toFixed(1)} s mobile`)
    expect(doc).toContain(`TBT ≤ ${BUDGETS.tbtMs} ms`)
    expect(doc).toContain(`CLS | ≤ ${BUDGETS.cls}`)
    expect(doc).toContain(`TTFB (ISR hit) | ≤ ${BUDGETS.ttfbMs} ms`)
  })

  it('the measurement conditions in 18 are the module’s', () => {
    // A budget without its conditions is unfalsifiable; the weld covers them too.
    expect(doc).toContain(
      `${THROTTLING.throughputKbps / 1024} Mbps,\n40 ms RTT, ${THROTTLING.cpuSlowdownMultiplier}× CPU slowdown`,
    )
    expect(THROTTLING.rttMs).toBe(40)
  })
})
