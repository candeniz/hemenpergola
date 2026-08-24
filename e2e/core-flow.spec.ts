import { expect, test, type Page } from '@playwright/test'

import { startDraft, walkWizardToReady } from './wizard-walk'

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
  await page.getByLabel('E-posta').fill('musteri@pergola.local')
  await page.getByLabel('Şifre').fill('phase4-core-flow-customer-password')
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
    await page.getByLabel('E-posta').fill('musteri@pergola.local')
    await page.getByLabel('Şifre').fill('phase4-core-flow-customer-password')
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

    const checkboxes = page.getByRole('checkbox')
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

  test.skip('5 · select: consent is captured and the request is sent to 1..5 manufacturers', async () => {
    // Phase 6. The KVKK boundary: contact data is NOT sent with the request, and the
    // consent row records the exact text version (19 §Consent).
    // Screens: manufacturer_selection_confirmation → request_success_confirmation
  })

  test.skip('6 · manufacturer accepts: contact is disclosed exactly once, with a record', async () => {
    // Phase 6. The single most important transition in the product. Asserts the DTO
    // difference — contact fields absent before ACCEPTED, present after — plus the
    // ContactDisclosure row, the audit entry and the notification to the customer.
    // Screens: manufacturer_request_detail_new_lead → manufacturer_request_detail
  })

  test.skip('7 · survey: an appointment is scheduled and then completed', async () => {
    // Phase 6. Completion is what makes the engagement review-eligible (16).
    // Screens: manufacturer_project_calendar, manufacturer_appointment_detail
  })

  test.skip('8 · final offer: line items, KDV and validity, then the customer decides', async () => {
    // Phase 6. Tax is computed once on the net total, never per line (11 §Offers and KDV),
    // and the original estimate is shown beside the offer so the gap is explained in place.
  })

  test.skip('9 · outcome: won or lost is recorded and a review becomes possible', async () => {
    // Phase 6 for the outcome, Phase 7 for the review that follows it.
  })
})
