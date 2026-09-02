import { expect, test, type BrowserContext, type Page } from '@playwright/test'

import { assertReady, startDraft, walkWizardToReady } from './wizard-walk'

/**
 * PHASE 4 GATE — `21-development-roadmap.md`: *a project reaches `READY` and survives a
 * browser restart mid-wizard.*
 *
 * The first half of the phase proved that for a **signed-in** customer, in
 * `core-flow.spec.ts` step 2. This proves the half that was missing and that `26` §Phase 4
 * calls the riskiest task in it: the same thing for an **anonymous visitor**, then the
 * hand-over to an account.
 *
 * ```
 * anonymous visitor configures  →  browser restart  →  the draft is still there
 *                               →  registers + signs in  →  the draft is theirs
 *                               →  the cookie alone can no longer reach it
 * ```
 *
 * ## What "browser restart" means here, and why it is not `page.reload()`
 *
 * A reload proves the *server* holds the state, which step 2 of the core flow already proves.
 * What 4.5 adds is that the **identity** survives too, and the identity is a cookie with a
 * thirty-day expiry. So the restart is modelled as a new browser context seeded from the old
 * one's `storageState()` — cookies restored from disk, everything in memory gone. That is
 * what closing and reopening a browser does, and a session cookie would fail it.
 *
 * ## The last step is the one that is easy to fake
 *
 * *"and from that moment `anonymousKey` is null"* cannot be read from a browser. What can be
 * observed is its only consequence, and it is a strong one: a context holding **only the old
 * draft cookie**, signed out, must no longer reach the project. Before the claim that context
 * owned the draft; after it, `ownedBy()` matches nothing and the page is a 404. A claim that
 * copied the customer in without clearing the key would leave that context still able to read
 * the row — which is exactly the bug `04`'s XOR constraint exists to make impossible, and the
 * reason it must be one statement.
 */

const PASSWORD = 'e2e-phase4-gate-password-1'

/**
 * **What the run creates, the run removes** — task 14.6, closing the half `14.4` deferred.
 *
 * These rows never reach a public surface — no directory card, no sitemap entry, no city
 * count — which is why the gate spec's company came first. But the debt is the same class and
 * the database grows on every run: forty-two `e2e-…@example.com` users had accumulated on the
 * demo database by the time this was written.
 *
 * **By recorded id, never by pattern.** `afterAll` runs per worker and Playwright spreads one
 * file's tests across workers, so a hook that swept `LIKE 'e2e-%'` would delete rows a
 * sibling worker was still using — the trap 14.4 walked into with the calendar spec. This
 * array is worker-local: each hook removes exactly what its own tests made, and an empty one
 * removes nothing.
 *
 * Projects go first. `Project.customer` is `onDelete: SetNull`, so deleting the user alone
 * would leave the drafts behind as orphans — litter that no longer even names its owner.
 */
const created: { emails: string[]; projectIds: string[] } = { emails: [], projectIds: [] }

async function pgExec(sql: string, params: unknown[]): Promise<void> {
  const { Client } = await import('pg')
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ?? 'postgresql://pergola:pergola@localhost:5432/pergola',
  })
  await client.connect()
  try {
    await client.query(sql, params)
  } finally {
    await client.end()
  }
}

test.afterAll(async () => {
  if (created.projectIds.length > 0) {
    await pgExec(`DELETE FROM "Project" WHERE "id" = ANY($1::text[])`, [created.projectIds])
  }
  if (created.emails.length > 0) {
    await pgExec(`DELETE FROM "User" WHERE "email" = ANY($1::text[])`, [created.emails])
  }
})

function uniqueEmail(): string {
  const email = `e2e-phase4-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`
  created.emails.push(email)
  return email
}

/**
 * `startDraft`, with the draft recorded. The helper is shared with other specs and stays
 * unaware of this file's bookkeeping; the id comes out of the URL it already returns.
 */
async function newDraft(page: Page): Promise<string> {
  const url = await startDraft(page)
  const id = /\/proje\/([^/?]+)/.exec(url)?.[1]
  if (id !== undefined) created.projectIds.push(id)
  return url
}

type Mail = { to: string; subject: string; text: string; link: string | null }

/** The dev mailbox — the `log` adapter's buffer, 404 outside development. */
async function verificationLink(page: Page, address: string): Promise<string> {
  const response = await page.request.get('/api/dev/mailbox')
  expect(response.ok(), 'the dev mailbox must be reachable in a development build').toBe(true)

  const body = (await response.json()) as { data: Mail[] }
  const mail = [...body.data]
    .reverse()
    .find((item) => item.to === address && item.subject.includes('doğrulayın'))

  expect(mail, `no verification mail for ${address}`).toBeDefined()
  expect(mail?.link, 'the mail must carry a link').not.toBeNull()

  const url = new URL((mail as Mail).link as string)
  return `${url.pathname}${url.search}`
}

test.describe('Phase 4 gate · an anonymous draft survives a restart and is claimed', () => {
  test('anonymous → READY → restart → register → claim → the cookie alone cannot reach it', async ({
    browser,
  }) => {
    const email = uniqueEmail()

    // ── 1 · an anonymous visitor configures — all the way to READY ────────────
    /*
     * The whole wizard, not just the dimensions step. `21`'s gate text is *"a project
     * reaches `READY` and survives a browser restart"*, and the earlier version of this
     * spec proved the restart and the claim while never running the readiness check — which
     * is exactly how "no real catalogue product could ever reach READY" passed this gate in
     * Phase 4 and was found by Phase 5's e2e instead. The walk is shared with
     * `core-flow.spec.ts` (`wizard-walk.ts`), so the two gates cannot drift apart, and it
     * ends by asserting the wizard's own verdict.
     */
    const first: BrowserContext = await browser.newContext()
    const page = await first.newPage()

    const draftUrl = await newDraft(page)
    await walkWizardToReady(page, 'İstanbul')

    /*
     * The cookie is the identity, and `10` §Anonymous drafts makes it `httpOnly` — so the
     * assertion is about the jar, not about anything the page can read. A missing `httpOnly`
     * here would be a real finding: the value addresses project data.
     */
    const cookies = await first.cookies()
    const draftCookie = cookies.find((cookie) => cookie.name.endsWith('pergola.anon'))

    expect(draftCookie, 'an anonymous draft must be addressed by a cookie').toBeDefined()
    expect(draftCookie?.httpOnly, 'the draft key is a bearer credential').toBe(true)

    const restored = await first.storageState()
    await first.close()

    // ── 2 · the browser restarts ──────────────────────────────────────────────
    const second = await browser.newContext({ storageState: restored })
    const reopened = await second.newPage()

    await reopened.goto(draftUrl)

    await expect(
      reopened.getByLabel(/genişlik|width/i),
      'the draft survives a browser restart because the cookie does and the row does',
    ).toHaveValue('5000')

    // …and `READY` survives with it: the restarted context re-runs the readiness check on
    // the summary step and gets the same verdict. This is the half of `21`'s gate sentence
    // the width assertion alone does not carry.
    await reopened.getByRole('button', { name: 'Özet' }).click()
    await assertReady(reopened)

    // ── 3 · the account wall, and the draft rides along ───────────────────────
    await reopened.goto('/kayit')

    await reopened.getByLabel('Ad soyad').fill('E2E Phase 4')
    await reopened.getByLabel('E-posta').fill(email)
    await reopened.getByLabel('Şifre', { exact: true }).fill(PASSWORD)
    await reopened.getByRole('checkbox').check()
    await reopened.getByRole('button', { name: 'Hesap oluştur' }).click()
    await expect(reopened.getByText('Hesabınız oluşturuldu')).toBeVisible({ timeout: 30_000 })

    await reopened.goto(await verificationLink(reopened, email))
    await expect(reopened.getByText('E-posta adresiniz doğrulandı')).toBeVisible({
      timeout: 30_000,
    })

    /*
     * Signing in *with the draft id in the query* is what the wizard's account wall links to,
     * and `claimThen` in `components/auth/forms.tsx` is what turns it into a claim.
     */
    const projectId = new URL(draftUrl).pathname.split('/').pop() as string

    await reopened.goto(`/giris?proje=${projectId}`)
    await reopened.getByLabel('E-posta').fill(email)
    await reopened.getByLabel('Şifre').fill(PASSWORD)
    await reopened.getByRole('button', { name: 'Giriş yap' }).click()

    // The claim redirects back to the draft rather than to the dashboard.
    await reopened.waitForURL(new RegExp(`/proje/${projectId}$`), { timeout: 30_000 })

    // ── 4 · it is now theirs, and it is listed as theirs ──────────────────────
    await reopened.goto('/hesap')

    await expect(
      reopened.getByRole('link', { name: /aç|open/i }).first(),
      'the claimed draft appears in the customer’s own list',
    ).toBeVisible()

    await second.close()

    // ── 5 · the cookie alone can no longer reach it ───────────────────────────
    /*
     * The same draft cookie, no session. Before the claim this context owned the project;
     * after it, `anonymousKey` is null and `ownedBy()` matches nothing.
     *
     * This is the observable form of *"and from that moment `anonymousKey` is null"*. A claim
     * that wrote `customerId` without clearing the key would leave this reachable — and that
     * is the two-statement version `04`'s CHECK constraint rejects.
     */
    const stranded = await browser.newContext({
      storageState: {
        cookies: restored.cookies.filter((cookie) => cookie.name.endsWith('pergola.anon')),
        origins: [],
      },
    })
    const strandedPage = await stranded.newPage()

    const response = await strandedPage.goto(draftUrl)

    expect(
      response?.status(),
      'a claimed draft is NOT_FOUND for the cookie that used to own it',
    ).toBe(404)

    await stranded.close()
  })

  test('the account gate: an anonymous visitor at /hesap is sent to sign in — Q24', async ({
    browser,
  }) => {
    /*
     * `07` §Rendering strategy has called `(customer)` *auth-gated* since Phase 0 and nothing
     * gated it; `middleware.ts` does locale only, correctly (`12` §Authorization: middleware
     * authenticates and redirects, it does not authorise). Task 4.8 is what made it matter —
     * the dashboard renders a project list, so "the page is harmless because it shows
     * nothing" stopped being true.
     *
     * The assertion is the redirect, not the absence of data. "No projects are visible" would
     * pass against an unguarded page that simply had nothing to show, which is precisely how
     * this survived four phases.
     */
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto('/hesap')
    await page.waitForURL(/\/giris/, { timeout: 30_000 })

    expect(page.url(), 'an anonymous visitor is asked to sign in, not refused').toContain('/giris')

    await context.close()
  })

  test('three drafts per key, and the fourth is refused — 10 §Anonymous drafts', async ({
    browser,
  }) => {
    /*
     * Counted in rows, server-side. A ceiling enforced only by a hidden button is a ceiling
     * any `curl` ignores, so the assertion is that the *fourth attempt* fails rather than
     * that a button disappears.
     */
    const context = await browser.newContext()
    const page = await context.newPage()

    await newDraft(page)
    await newDraft(page)
    await newDraft(page)

    await page.goto('/proje/yeni')
    await page
      .getByRole('button', { name: /yapılandır|configure/i })
      .first()
      .click()

    await expect(
      page.getByRole('status'),
      'the fourth draft on one browser key is refused, and says why',
    ).toBeVisible({ timeout: 30_000 })

    expect(page.url(), 'and no draft is created').toContain('/proje/yeni')

    await context.close()
  })
})
