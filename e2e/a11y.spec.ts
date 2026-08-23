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
  /*
   * Signed in since `ADR-024`: the segment layouts now redirect an anonymous visitor to
   * `/giris`, so an unauthenticated scan of these two paths would scan the login page twice
   * under two wrong names — and silently stop scanning the shells this suite has covered
   * since Phase 0. The credentials are the demo seed's (`prisma/seed/profiles.ts`).
   */
  { path: '/hesap', name: 'customer dashboard shell', signInAs: 'customer' },
  { path: '/panel', name: 'manufacturer portal shell', signInAs: 'manufacturer' },
  // Where the gate sends an anonymous visitor — scanned under its own name.
  { path: '/giris', name: 'sign-in' },
  { path: '/yonetim', name: 'admin shell' },
  { path: '/dev/tokens', name: 'token sheet' },
  { path: '/dev/ui', name: 'UI gallery' },
  { path: '/yonetim/katalog', name: 'admin catalogue' },
  { path: '/yonetim/ayarlar', name: 'platform settings' },
  { path: '/yonetim/ureticiler', name: 'verification queue' },
  { path: '/yonetim/denetim', name: 'audit viewer' },

  /*
   * The overlays, **open**.
   *
   * Until Phase 2 this suite scanned the gallery with every overlay closed, which scans the
   * triggers. `ui/dialog.tsx` shipped `max-w-lg` in Phase 0 — 48 pixels in this theme — and
   * neither the gallery nor this file noticed, because neither ever opened one.
   *
   * One overlay per page load: two open scrims stack, and axe would then report the
   * stacking instead of the component.
   */
  { path: '/dev/ui?overlay=dialog', name: 'dialog, open', expect: 'dialog' },
  { path: '/dev/ui?overlay=sheet', name: 'sheet, open', expect: 'dialog' },
  { path: '/dev/ui?overlay=dropdown', name: 'dropdown, open', expect: 'menu' },
  { path: '/dev/ui?overlay=tooltip', name: 'tooltip, open', expect: 'tooltip' },
  { path: '/dev/ui?overlay=select', name: 'select, open', expect: 'listbox' },
  { path: '/dev/ui?overlay=toast', name: 'toast, visible', expect: 'status' },
] as const

const SEED_EMAILS = {
  customer: 'musteri@pergola.local',
  manufacturer: 'owner@marmaracam.local',
} as const

/**
 * A session **fixture**, not a login.
 *
 * These two tests are about the shells' accessibility, not about signing in — the login flow
 * has its own specs. Going through the form here would also spend the auth surface's rate
 * budget (`06` §Rate limits: 10 / 15 min per IP), which the suite's *real* login tests
 * already consume: two more UI logins is exactly what tipped the suite over the limit when
 * `ADR-024`'s gates made these routes need a session at all. So the session row is written
 * directly — the same opaque-token shape `web-session.ts` writes — and the cookie is set on
 * the context. The gate still runs: a wrong or expired token would redirect to `/giris` and
 * the scan would fail on the wrong page.
 */
async function seedSession(email: string): Promise<{ token: string; expires: Date }> {
  const { Client } = await import('pg')
  const { randomBytes } = await import('node:crypto')

  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ?? 'postgresql://pergola:pergola@localhost:5432/pergola',
  })
  await client.connect()

  try {
    const token = randomBytes(32).toString('base64url')
    const expires = new Date(Date.now() + 60 * 60 * 1000)

    const inserted = await client.query(
      `INSERT INTO "Session" ("id", "sessionToken", "userId", "expires")
       SELECT gen_random_uuid()::text, $1, u."id", $2
       FROM "User" u WHERE u."email" = $3
       RETURNING "sessionToken"`,
      [token, expires, email],
    )

    if (inserted.rowCount !== 1) {
      throw new Error(`no seeded user with email ${email} — run \`pnpm seed demo\` first`)
    }

    return { token, expires }
  } finally {
    await client.end()
  }
}

for (const route of ROUTES) {
  test(`${route.name} (${route.path}) has no WCAG 2 A/AA violations`, async ({ page, baseURL }) => {
    if ('signInAs' in route) {
      const session = await seedSession(SEED_EMAILS[route.signInAs])

      await page.context().addCookies([
        {
          name: 'pergola.session',
          value: session.token,
          url: baseURL ?? 'http://127.0.0.1:3100',
          httpOnly: true,
          sameSite: 'Lax',
          expires: Math.floor(session.expires.getTime() / 1000),
        },
      ])
    }

    await page.goto(route.path)

    const overlayRole = 'expect' in route ? route.expect : null

    if (overlayRole !== null) {
      /*
       * Wait for the overlay, and **assert it is there**. Radix portals on the next frame
       * and sonner dispatches from an effect, so a scan that did not wait would scan an
       * empty portal and pass — a green run measuring nothing, which is worse than the bug
       * it was added to catch.
       */
      await expect(page.getByRole(overlayRole).first()).toBeVisible({ timeout: 10_000 })
    }

    const builder = new AxeBuilder({ page })

    if (overlayRole !== null) {
      /*
       * Scan the overlay, not the page underneath it.
       *
       * Radix's `DropdownMenu` and `Select` are modal: opening one puts `aria-hidden` on
       * everything else, and axe then reports `aria-hidden-focus` once per focusable thing
       * in the hidden subtree — nineteen of them on a gallery page that deliberately renders
       * every primitive at once. That is a fact about *this page having forty widgets on
       * it*, not about the menu, and `/dev/ui` with no overlay is already scanned above with
       * nothing excluded.
       *
       * Overlays portal to `body`, so excluding `main` leaves exactly the open component.
       */
      builder.exclude('main')
    }

    const results = await builder
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
