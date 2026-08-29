import { expect, test } from '@playwright/test'

import { SEED_CUSTOMER_EMAIL } from '../prisma/seed/accounts'

/**
 * `/hesap/verilerim` — the account's own controls over its own data, `19` §Data subject
 * rights.
 *
 * **This spec exists because of what its absence hid.** `29` A1 and A2 carried a ✅ backed
 * by `privacy.integration.test.ts`, which proves the export and erasure *services* work. It
 * proves nothing about whether a person can reach them, and until Phase 10.2 nobody could:
 * `requestDataExport` and `anonymiseAccount` had authorisation entries, integration tests,
 * and no page, no action and no route. A checklist row that names a service test as evidence
 * for a user-facing right is evidence of the wrong thing.
 *
 * So the assertions here are deliberately about **reachability and gating**, not about what
 * the services compute — that is covered, and re-proving it through a browser would be slow
 * and worse. What only a browser can show: the page is behind the auth wall, the controls
 * are on it, and the irreversible one refuses to arm until it has been confirmed twice.
 *
 * The session comes from `session-fixture.ts` rather than the login form (`06` §Rate limits
 * — the budget is 10 attempts / 15 min per IP *and per account*, and this spec's subject is
 * not signing in).
 */

const CUSTOMER = SEED_CUSTOMER_EMAIL

test.describe('KVKK · the account can reach its own data controls', () => {
  test('the page is behind the auth wall', async ({ page }) => {
    await page.goto('/hesap/verilerim')

    // `ADR-024` — a stranger meets the sign-in redirect, not the page.
    await expect(page).toHaveURL(/giris/, { timeout: 30_000 })
  })

  test('a signed-in customer finds preferences, export and erasure on it', async ({ page }) => {
    const { seedSessionCookie } = await import('./session-fixture')
    await seedSessionCookie(page, CUSTOMER)

    await page.goto('/hesap/verilerim')

    await expect(page.getByRole('heading', { name: 'Bildirim tercihleri' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByRole('heading', { name: 'Verilerimi indir' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Hesabımı sil' })).toBeVisible()

    // A mandatory event (`ADR-027`) is shown and disabled rather than hidden: the user can
    // see why one notification keeps arriving.
    const disclosureRow = page.getByRole('row', { name: /İletişim bilgileri paylaşıldı/ })
    await expect(disclosureRow).toBeVisible()
    await expect(disclosureRow.getByRole('switch').first()).toBeDisabled()
  })

  test('the export request is one click and reports back', async ({ page }) => {
    const { seedSessionCookie } = await import('./session-fixture')
    await seedSessionCookie(page, CUSTOMER)

    await page.goto('/hesap/verilerim')
    await page.getByRole('button', { name: 'Dışa aktarım iste' }).click()

    // The package is emailed as a signed link (`19`: 30 days, target 72 h), so success is
    // an acknowledgement rather than a download.
    await expect(page.getByText('Talebiniz alındı')).toBeVisible({ timeout: 60_000 })
  })

  test('erasure will not arm without the typed email and the acknowledgement', async ({ page }) => {
    const { seedSessionCookie } = await import('./session-fixture')
    await seedSessionCookie(page, CUSTOMER)

    await page.goto('/hesap/verilerim')

    // The destructive form is not on the page until it is asked for.
    await expect(page.getByLabel('Onaylamak için hesabınızın e-posta adresini yazın')).toHaveCount(
      0,
    )
    await page.getByRole('button', { name: 'Hesabımı silmek istiyorum' }).click()

    const submit = page.getByRole('button', { name: 'Hesabımı kalıcı olarak sil' })
    await expect(submit).toBeVisible({ timeout: 30_000 })

    // Gate 3: disabled until the irreversibility checkbox is ticked — the account survives
    // this spec, which is the point of stopping here rather than submitting.
    await expect(submit).toBeDisabled()
    await page.getByLabel('Bu işlemin geri alınamayacağını anlıyorum.').check()
    await expect(submit).toBeEnabled()

    // Gate 2 is the service's: a mismatched address is refused with PRECONDITION, so it
    // holds for the route handler and the mobile client too.
    await page
      .getByLabel('Onaylamak için hesabınızın e-posta adresini yazın')
      .fill('yanlis@ornek.com')
    await submit.click()
    await expect(page.getByText('Silme işlemi tamamlanamadı')).toBeVisible({ timeout: 30_000 })
  })
})
