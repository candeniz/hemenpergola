import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * The a11y stage of the pipeline (`23` §Pipeline). Unlike the core-flow gate this runs for
 * real from Phase 0 — the shells, the type scale and the token palette are exactly the
 * things an automated pass can check, and they are cheapest to fix now.
 *
 * `07` §Accessibility and responsive lists the non-negotiables. Automated tooling catches
 * roughly the contrast, name/role/value and landmark subset of those; the rest (keyboard
 * order, focus ring, 44px targets) is checked in `/dev/ui` and by hand.
 */
const ROUTES = [
  { path: '/', name: 'public home (tr)' },
  { path: '/en', name: 'public home (en)' },
  { path: '/hesap', name: 'customer dashboard shell' },
  { path: '/panel', name: 'manufacturer portal shell' },
  { path: '/yonetim', name: 'admin shell' },
  { path: '/dev/tokens', name: 'token sheet' },
  { path: '/dev/ui', name: 'UI gallery' },
] as const

for (const route of ROUTES) {
  test(`${route.name} (${route.path}) has no WCAG 2 A/AA violations`, async ({ page }) => {
    await page.goto(route.path)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      /*
       * The colour swatches on /dev/tokens are the only excluded elements in the suite, and
       * the exclusion is narrow on purpose: several of those pairs are *deliberately*
       * failing or exempt — the page exists to show them next to their measured ratio. Axe
       * flagging them is axe being right; the page's own audit table reports the same
       * numbers more precisely, and `design-tokens.test.ts` fails the build if a pair that
       * is supposed to pass stops passing. Every other rule stays active on this page.
       */
      .exclude('[data-contrast-sample]')
      .analyze()

    // Print the rule ids and the offending selectors, so a CI failure is actionable
    // without downloading an artefact.
    expect(
      results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.target.join(' ')),
      })),
    ).toEqual([])
  })
}
