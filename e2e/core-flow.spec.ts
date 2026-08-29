import { expect, test, type Page } from '@playwright/test'

import { NOTE_TRAP, startDraft, walkWizardToReady } from './wizard-walk'
import {
  SEED_CUSTOMER_EMAIL,
  SEED_MANUFACTURER_EMAIL,
  SEED_PASSWORD,
} from '../prisma/seed/accounts'

/**
 * THE RELEASE GATE.
 *
 * `20-testing-strategy.md` §End to end: this spec walks the nine steps of
 * `03-user-flows.md` §F1 across three browser contexts (customer, manufacturer, admin)
 * against a seeded database. **A release with a failing core-flow spec does not ship.
 * Nothing else has that status.**
 *
 * It exists from Phase 0, empty, on purpose. A gate introduced in Phase 6 is a gate that
 * was optional until Phase 6. Each step un-skips in the phase named in its comment, and the
 * count of remaining `skip`s is the honest measure of how much of the product actually
 * works end to end.
 *
 *   step 1–2   Phase 4  · configurator
 *   step 3–4   Phase 5  · matching + pricing
 *   step 5–9   Phase 6  · offer request lifecycle
 *
 * Do not delete a step to make the suite green. Do not add a step that F1 does not have.
 */

/*
 * One client address per test — the same discipline `account.spec.ts` documents at length.
 * Steps 3–4 briefly used a session *fixture* instead of the form, because their two extra
 * logins pushed the suite past the auth surface's 10-per-15-min-per-IP budget; that was the
 * wrong fix. The release gate signing in through the real form is precisely what caught Q23
 * (a login that validated, rendered a tick and set nothing), so the form is back and the
 * budget is solved the way the limiter intends: each test is its own visitor.
 */
const RUN = Math.floor(Math.random() * 250)
let addresses = 0

test.beforeEach(async ({ page }, testInfo) => {
  addresses += 1
  await page.setExtraHTTPHeaders({
    'x-forwarded-for': `10.${RUN}.${testInfo.workerIndex + 101}.${addresses % 250}`,
  })
})

/** The seeded customer, signed in through the real form — the same login step 2 tests. */
async function signIn(page: Page): Promise<void> {
  await page.goto('/giris')
  await page.getByLabel('E-posta').fill(SEED_CUSTOMER_EMAIL)
  await page.getByLabel('Şifre').fill(SEED_PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await page.waitForURL(/\/hesap/, { timeout: 30_000 })
}

/** The shared walk — see `wizard-walk.ts`; both gates assert the same READY. */
async function configureToReady(page: Page, cityName: string): Promise<void> {
  await startDraft(page)
  await walkWizardToReady(page, cityName)
}

test.describe('F1 · core flow (release gate)', () => {
  test('1 · discover: a visitor reaches a configurable product without an account', async ({
    page,
  }) => {
    /*
     * Un-skipped in Phase 4.
     *
     * F1 draws this as homepage → product detail, and those two screens are Phase 8 — there is
     * no `/urunler/[slug]` yet. What Phase 4 can prove is the half F1 actually depends on:
     * **a visitor with no account reaches a product they can configure.** `ADR-021` is what
     * makes that true, and it is the step that would otherwise be assumed rather than tested.
     *
     * Phase 8 widens the entry point to the homepage; the assertion below stays.
     */
    await page.goto('/proje/yeni')

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const configure = page.getByRole('button', { name: /yapılandır|configure/i }).first()
    await expect(configure, 'a visitor is offered at least one configurable product').toBeVisible()
  })

  test('2 · configure: the wizard produces a READY project and survives a reload', async ({
    page,
  }) => {
    /*
     * Un-skipped in Phase 4. Three visible stages, ten logical steps (`ADR-013`).
     *
     * **The reload is the point.** Each step persists through `PATCH /projects/{id}`, so state
     * lives in the database rather than a client store (`07` §Forms) — reloading mid-wizard
     * and finding the values still there is what proves it, and it is the half of the phase
     * gate that a client-state implementation would fail.
     */
    /*
     * Signed in, because Phase 4's gate is *a signed-in customer walks the wizard*. Anonymous
     * drafts are task 4.5: until then `createProject` refuses a caller with no identity, since
     * `04` §Project's CHECK constraint requires exactly one owner. Step 1 above already proves
     * the *page* is reachable without an account, which is `ADR-021`'s claim.
     */
    await page.goto('/giris')
    // The same locators `account.spec.ts` already proves against this form.
    await page.getByLabel('E-posta').fill(SEED_CUSTOMER_EMAIL)
    await page.getByLabel('Şifre').fill(SEED_PASSWORD)
    await page.getByRole('button', { name: 'Giriş yap' }).click()

    // Wait for the navigation the form performs once a session exists (`ADR-022`). Asserting
    // the error text is absent would pass without a session at all — that is exactly how Q23
    // survived three phases.
    await page.waitForURL(/\/hesap/, { timeout: 30_000 })

    await page.goto('/proje/yeni')
    await page
      .getByRole('button', { name: /yapılandır|configure/i })
      .first()
      .click()

    // `(?!yeni)`: the entry point itself matches `/proje/<something>`, so without the
    // lookahead this resolves before the redirect and captures the wrong URL.
    await page.waitForURL(/\/proje\/(?!yeni)[^/]+$/)
    const url = page.url()

    // Dimensions, then leave the step so it is written.
    await page.getByLabel(/genişlik|width/i).fill('5000')
    await page.getByLabel(/derinlik|depth/i).fill('4000')
    await page.getByLabel(/yükseklik|height/i).fill('2800')
    await page
      .getByRole('button', { name: /kaydet|save/i })
      .first()
      .click()

    // The area is derived and shown live; the customer never types it (`10` §Field specifics).
    await expect(page.getByText(/20/)).toBeVisible()

    /*
     * Wait for the wizard's own confirmation before reloading. The area above is derived
     * client-side and is visible before the PATCH round-trips, so without this the reload
     * races the write it is about to assert on — and on a cold server the reload's render
     * wins, reading the row before the save commits. The confirmation is the observable
     * form of "the write landed"; the assertion below is unchanged.
     */
    await expect(page.getByRole('status')).toHaveText(/kaydedildi|saved/i, { timeout: 30_000 })

    // ── the assertion this step exists for ────────────────────────────────────
    await page.reload()
    await expect(
      page.getByLabel(/genişlik|width/i),
      'the wizard survives a reload because the state is in the database',
    ).toHaveValue('5000')
    expect(page.url()).toBe(url)
  })

  test('3 · request offers: matching and pricing return ranked, priced manufacturers', async ({
    page,
  }) => {
    /*
     * Un-skipped in Phase 5. Synchronous in fact, asynchronous in feel (03 §F1 details):
     * the first visit computes behind `finding_manufacturers_loading_state`, and what the
     * customer then sees is `matched_manufacturers_results` — ranked cards whose price is a
     * band from `EstimateBand`, never a line item (`ADR-006`).
     *
     * Covers the zero-match branch too, because `09` §Zero-result handling calls it a
     * legitimate outcome and `07` §System states keeps "empty" and "error" apart: a second
     * project in a province no seeded company covers must meet the ladder, not an error.
     */
    await signIn(page)
    await configureToReady(page, 'İstanbul')

    await page.getByRole('link', { name: 'Teklif al' }).click()
    await page.waitForURL(/\/hesap\/projeler\/[^/]+\/eslesmeler/, { timeout: 60_000 })

    // Ranked, priced: the seeded supply guarantees at least two published price books
    // covering İstanbul, so at least two cards must carry a band — "₺x – ₺y".
    const bands = page.getByText(/₺[\d.,]+\s*–\s*₺[\d.,]+/)
    await expect(bands.first()).toBeVisible({ timeout: 60_000 })
    expect(await bands.count()).toBeGreaterThanOrEqual(2)

    // The estimate label rides every band (`PRC-05`): estimated, excl. KDV.
    await expect(page.getByText(/KDV hariç/i).first()).toBeVisible()

    // ── the zero-match branch ─────────────────────────────────────────────────
    await configureToReady(page, 'Trabzon')
    await page.getByRole('link', { name: 'Teklif al' }).click()
    await page.waitForURL(/\/hesap\/projeler\/[^/]+\/eslesmeler/, { timeout: 60_000 })

    // An empty state with a ladder, not an error page.
    await expect(page.getByText('Bu proje için henüz birebir eşleşme yok')).toBeVisible({
      timeout: 60_000,
    })

    const watch = page.getByRole('button', {
      name: 'Bölgemi kapsayan üretici gelince haber ver',
    })
    await expect(watch).toBeVisible()
    await watch.click()
    await expect(page.getByText(/haber vereceğiz/i)).toBeVisible({ timeout: 30_000 })
  })

  test('4 · compare: the customer sorts, filters and compares at most three', async ({ page }) => {
    /*
     * Un-skipped in Phase 5. The cap is 3 (`CUS-06`) and it is asserted on both sides of
     * the URL: the fourth checkbox is refused with a reason in the list, and the compare
     * page itself drops extras — a cap only the checkboxes enforce is a cap any edited URL
     * ignores. The price shown is a band, never a line item (`PRC-03`).
     */
    await signIn(page)
    await configureToReady(page, 'İstanbul')

    await page.getByRole('link', { name: 'Teklif al' }).click()
    await page.waitForURL(/\/hesap\/projeler\/[^/]+\/eslesmeler/, { timeout: 60_000 })
    await expect(page.getByText(/₺[\d.,]+\s*–\s*₺[\d.,]+/).first()).toBeVisible({
      timeout: 60_000,
    })

    // Scoped to the result cards: the consent checkbox joined the page in Phase 6, and an
    // unscoped nth() would tick it as if it were a company.
    const checkboxes = page.locator('li').getByRole('checkbox')
    const available = await checkboxes.count()
    expect(
      available,
      'the seeded supply provides at least three candidates',
    ).toBeGreaterThanOrEqual(3)

    for (let index = 0; index < 3; index += 1) {
      await checkboxes.nth(index).check()
    }

    if (available > 3) {
      // The fourth selection is refused, with a reason — not silently dropped.
      await checkboxes.nth(3).click()
      await expect(checkboxes.nth(3)).not.toBeChecked()
      await expect(page.getByText('En fazla 3 firma karşılaştırılabilir.')).toBeVisible()
    }

    await page.getByRole('link', { name: /Seçilenleri karşılaştır \(3\/3\)/ }).click()
    await page.waitForURL(/\/karsilastir\?firmalar=/, { timeout: 30_000 })

    // Three columns, each with the shared band component's label — and nothing that looks
    // like a line item.
    await expect(page.getByText('Tahmini aralık').first()).toBeVisible({ timeout: 30_000 })
    expect(await page.getByText('Tahmini aralık').count()).toBe(3)

    // The cap holds against the URL too: five ids in, three columns out, a note saying so.
    const url = new URL(page.url())
    const ids = (url.searchParams.get('firmalar') ?? '').split(',')
    url.searchParams.set('firmalar', [...ids, 'edited-in-1', 'edited-in-2'].join(','))
    await page.goto(url.pathname + url.search)

    await expect(page.getByText('Tahmini aralık').first()).toBeVisible({ timeout: 30_000 })
    expect(await page.getByText('Tahmini aralık').count()).toBeLessThanOrEqual(3)
    await expect(page.getByText(/En fazla 3 firma yan yana/)).toBeVisible()
  })

  /*
   * Steps 5–9 are one engagement walked across two browsers, so they run SERIALLY and
   * share state — a customer context and a manufacturer context created in step 5 and
   * carried to step 9. Ege Pergola is the manufacturer: seeded with an İstanbul service
   * area and a PUBLISHED price book, so the offer lands on a request that showed a band.
   * Database facts (disclosure rows, audit entries, notifications) are asserted through
   * `pg`, the same channel `session-fixture.ts` already uses — the DTO-shape proofs live
   * in the integration suite; what this spec proves is the same rules holding through the
   * real pages.
   */
  test.describe.serial('5–9 · one engagement, customer and manufacturer', () => {
    let customerPage: Page
    let manufacturerPage: Page
    let requestId = ''
    let projectUrl = ''

    async function pgQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
      const { Client } = await import('pg')
      const client = new Client({
        connectionString:
          process.env.DATABASE_URL ?? 'postgresql://pergola:pergola@localhost:5432/pergola',
      })
      await client.connect()
      try {
        const result = await client.query(sql, params)
        return result.rows as T[]
      } finally {
        await client.end()
      }
    }

    test.beforeAll(async ({ browser }) => {
      const customerContext = await browser.newContext({
        extraHTTPHeaders: { 'x-forwarded-for': `10.${RUN}.201.1` },
      })
      customerPage = await customerContext.newPage()

      const manufacturerContext = await browser.newContext({
        extraHTTPHeaders: { 'x-forwarded-for': `10.${RUN}.201.2` },
      })
      manufacturerPage = await manufacturerContext.newPage()
    })

    test('5 · select: consent is captured and the request is sent to 1..5 manufacturers', async () => {
      const page = customerPage
      await signIn(page)
      await configureToReady(page, 'İstanbul')
      projectUrl = page.url()

      await page.getByRole('link', { name: 'Teklif al' }).click()
      await page.waitForURL(/\/hesap\/projeler\/[^/]+\/eslesmeler/, { timeout: 60_000 })
      await expect(page.getByText(/₺[\d.,]+\s*–\s*₺[\d.,]+/).first()).toBeVisible({
        timeout: 60_000,
      })

      // Select Ege Pergola — the priced, seeded supplier the rest of the chain signs in as.
      await page
        .locator('li', { has: page.getByText('Ege Pergola', { exact: true }) })
        .getByRole('checkbox')
        .check()

      // `19` §Consent: never pre-checked — the send button stays dead until the tick.
      const send = page.getByRole('button', { name: 'İsteği gönder' })
      await expect(send).toBeDisabled()
      await page.getByText(/paylaşılmasına onay veriyorum/).click()
      await expect(send).toBeEnabled()
      await send.click()

      await page.waitForURL(/\/hesap\/projeler\/[^/]+\/talepler/, { timeout: 60_000 })
      await expect(page.getByText('Yanıt bekleniyor').first()).toBeVisible({ timeout: 30_000 })

      const projectId = /\/hesap\/projeler\/([^/]+)\/talepler/.exec(page.url())?.[1] ?? ''
      const rows = await pgQuery<{ id: string; consentId: string; textVersion: string }>(
        `SELECT r."id", r."consentId", c."textVersion"
         FROM "OfferRequest" r JOIN "Consent" c ON c."id" = r."consentId"
         WHERE r."projectId" = $1`,
        [projectId],
      )
      expect(rows).toHaveLength(1)
      // The consent row records the exact text version shown (`19` §Consent).
      expect(rows[0]!.textVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.v\d+$/)
      requestId = rows[0]!.id
    })

    test('6 · manufacturer accepts: contact is disclosed exactly once, with a record', async () => {
      const page = manufacturerPage

      await page.goto('/giris')
      await page.getByLabel('E-posta').fill(SEED_MANUFACTURER_EMAIL)
      await page.getByLabel('Şifre').fill(SEED_PASSWORD)
      await page.getByRole('button', { name: 'Giriş yap' }).click()
      await page.waitForURL(/\/hesap/, { timeout: 30_000 })

      const companyId = (
        await pgQuery<{ companyId: string }>(
          `SELECT "companyId" FROM "OfferRequest" WHERE "id" = $1`,
          [requestId],
        )
      )[0]!.companyId

      // ── before: the pending page renders NO contact, and no disclosure row exists ──
      await page.goto(`/panel/${companyId}/talepler/${requestId}`)
      await expect(page.getByText(/kabul ettiğinizde paylaşılır/)).toBeVisible({
        timeout: 30_000,
      })
      /*
       * The page SOURCE, not visibility: getByText().toBeHidden() stays green while the
       * email sits in the HTML or the RSC payload with display:none over it. The DTO-shape
       * proof lives in the integration suite; this asserts the same rule through the wire
       * the browser actually received — for the account email AND for the contact data
       * hidden inside the free-text note (ADR-026).
       */
      const preAcceptHtml = await page.content()
      expect(preAcceptHtml).not.toContain(SEED_CUSTOMER_EMAIL)
      expect(preAcceptHtml).not.toContain('0532 555 0000')
      expect(preAcceptHtml).not.toContain(NOTE_TRAP)

      expect(
        Number(
          (
            await pgQuery<{ count: string }>(
              `SELECT count(*) AS count FROM "ContactDisclosure" WHERE "offerRequestId" = $1`,
              [requestId],
            )
          )[0]!.count,
        ),
      ).toBe(0)

      // ── accept ────────────────────────────────────────────────────────────
      await page.getByRole('button', { name: 'Talebi kabul et' }).click()
      await expect(page.getByText(SEED_CUSTOMER_EMAIL)).toBeVisible({ timeout: 30_000 })
      // …and the note crossed WITH the disclosure (ADR-026): same source-level check.
      await expect(page.getByText(NOTE_TRAP)).toBeVisible()
      expect(await page.content()).toContain('0532 555 0000')

      // Exactly once, with its record set: the row, the audit entries, the notification.
      const counts = await pgQuery<{ disclosures: string; audits: string; notes: string }>(
        `SELECT
           (SELECT count(*) FROM "ContactDisclosure" WHERE "offerRequestId" = $1) AS disclosures,
           (SELECT count(*) FROM "AuditLog"
             WHERE "entityType" = 'OfferRequest' AND "entityId" = $1
               AND "action" = 'contact_disclosed') AS audits,
           (SELECT count(*) FROM "Notification"
             WHERE "type" = 'contact_disclosed'
               AND payload->>'offerRequestId' = $1) AS notes`,
        [requestId],
      )
      expect(counts[0]).toEqual({ disclosures: '1', audits: '1', notes: '1' })
    })

    test('7 · survey: an appointment is scheduled and then completed', async () => {
      const page = manufacturerPage

      const tomorrow = new Date(Date.now() + 24 * 3600 * 1000)
      const local = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16)

      await page.getByLabel('Keşif randevusu').fill(local)
      await page.getByRole('button', { name: 'Randevu planla' }).click()
      await expect(page.getByRole('button', { name: /tamamlandı olarak işaretle/ })).toBeVisible({
        timeout: 30_000,
      })

      // The machine refuses completing a visit that has not happened; move the clock the
      // way the integration suite does, then complete for real through the page.
      await pgQuery(
        `UPDATE "Appointment" SET "scheduledAt" = now() - interval '1 hour'
         WHERE "offerRequestId" = $1 AND "status" = 'SCHEDULED'`,
        [requestId],
      )

      await page.getByRole('button', { name: /tamamlandı olarak işaretle/ }).click()
      await expect(page.getByText('Keşif tamamlandı.')).toBeVisible({ timeout: 30_000 })

      const status = await pgQuery<{ status: string }>(
        `SELECT "status" FROM "OfferRequest" WHERE "id" = $1`,
        [requestId],
      )
      expect(status[0]!.status).toBe('SURVEY_COMPLETED')
    })

    test('8 · final offer: line items, KDV and validity, then the customer decides', async () => {
      const manufacturer = manufacturerPage

      await manufacturer.getByLabel('Açıklama').fill('Bioklimatik pergola, montaj dahil')
      await manufacturer.getByLabel('Birim fiyat (TL)').fill('100000')
      await manufacturer.getByRole('button', { name: 'Teklifi gönder' }).click()
      await expect(manufacturer.getByText(/Teklif gönderildi:/)).toBeVisible({ timeout: 30_000 })

      // KDV once, on the net total, stored gross — read back from the row (`11`).
      const offer = await pgQuery<{ netKurus: number; taxKurus: number; grossKurus: number }>(
        `SELECT "netKurus", "taxKurus", "grossKurus" FROM "Offer"
         WHERE "offerRequestId" = $1 AND "status" = 'SENT'`,
        [requestId],
      )
      expect(offer).toHaveLength(1)
      expect(offer[0]!.grossKurus).toBe(offer[0]!.netKurus + offer[0]!.taxKurus)
      expect(offer[0]!.netKurus).toBe(100_000_00)

      // The customer sees the offer BESIDE the original estimate, with the net-of-KDV note
      // bridging the gap (`ADR-007`, task 6.9).
      const customer = customerPage
      await customer.reload()
      await expect(customer.getByText('İlk tahmininiz')).toBeVisible({ timeout: 30_000 })
      await expect(customer.getByText(/KDV hariçti/)).toBeVisible()
      await expect(customer.getByText('Genel toplam (KDV dahil)')).toBeVisible()

      await customer.getByRole('button', { name: 'Teklifi kabul et' }).click()
      // The durable signal, not the transient confirmation: router.refresh() replaces the
      // decision component with the new status badge, and under full-suite load the refresh
      // can land before the confirmation text ever paints.
      await expect(customer.getByText('Teklif kabul edildi')).toBeVisible({ timeout: 30_000 })

      const status = await pgQuery<{ status: string }>(
        `SELECT "status" FROM "OfferRequest" WHERE "id" = $1`,
        [requestId],
      )
      expect(status[0]!.status).toBe('OFFER_ACCEPTED')
    })

    test('9 · outcome: won or lost is recorded and a review becomes possible', async () => {
      const page = manufacturerPage

      await page.reload()
      await page.getByRole('button', { name: 'Kazanıldı olarak işaretle' }).click()
      await expect(page.getByText(/kazanıldı olarak kaydedildi/)).toBeVisible({ timeout: 30_000 })

      const row = await pgQuery<{ status: string; completed: string }>(
        `SELECT r."status",
                (SELECT count(*) FROM "Appointment" a
                  WHERE a."offerRequestId" = r."id" AND a."status" = 'COMPLETED') AS completed
         FROM "OfferRequest" r WHERE r."id" = $1`,
        [requestId],
      )
      // WON recorded — and the completed survey is what Phase 7's review-eligibility reads.
      expect(row[0]!.status).toBe('WON')
      expect(Number(row[0]!.completed)).toBeGreaterThanOrEqual(1)
      void projectUrl
    })
  })
})
