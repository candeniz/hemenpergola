import { expect, test, type Page } from '@playwright/test'

import { SEED_MANUFACTURER_EMAIL } from '../prisma/seed/accounts'

/**
 * Task 14.1 — the manufacturer calendar, `manufacturer_project_calendar`.
 *
 * The route existed in the nav from Phase 3 and **404'd**, which is the failure
 * `nav-items.ts`'s own comment warns about: *"a link to a 404 advertises a page the same
 * way a disabled link advertises a feature."* The first test here is therefore the dullest
 * and the most valuable — the link in the shipped sidebar reaches a page.
 *
 * The engagement is planted through SQL rather than walked, for the reason
 * `messaging-reviews.spec.ts` sets out: the release gate already walks F1, the service is
 * locked by its own tests, and what is provable only here is that the SURFACE renders.
 *
 * Signed in through the **session fixture**, not the form: `06` §Rate limits gives 10 auth
 * attempts per 15 minutes per account, and the suite's real auth specs already spend that
 * budget on the seeded accounts.
 */

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

async function signInManufacturer(page: Page): Promise<void> {
  const { seedSessionCookie } = await import('./session-fixture')
  await seedSessionCookie(page, SEED_MANUFACTURER_EMAIL)
}

async function companyId(): Promise<string> {
  const [row] = await pgQuery<{ id: string }>(
    `SELECT c."id" FROM "Company" c
     JOIN "CompanyMembership" m ON m."companyId" = c."id"
     JOIN "User" u ON u."id" = m."userId"
     WHERE u."email" = $1 LIMIT 1`,
    [SEED_MANUFACTURER_EMAIL],
  )
  if (row === undefined) throw new Error('seed demo has not run: no company for the manufacturer')
  return row.id
}

test.describe('14.1 · the manufacturer calendar', () => {
  test('the sidebar link reaches a page instead of a 404', async ({ page }) => {
    await signInManufacturer(page)
    const id = await companyId()

    const response = await page.goto(`/panel/${id}/takvim`)
    expect(response?.status(), 'the route the nav has advertised since Phase 3').toBe(200)

    // The month heading is rendered from the resolved month, so its presence proves the
    // service answered rather than the page falling back to an empty shell.
    await expect(page.getByRole('heading', { name: 'Takvim' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Takvim' })).toBeVisible()
  })

  test('paging is a URL, so it works without JavaScript and survives a reload', async ({
    page,
  }) => {
    await signInManufacturer(page)
    const id = await companyId()

    await page.goto(`/panel/${id}/takvim?yil=2026&ay=1`)
    await expect(page.getByText('Ocak 2026')).toBeVisible()

    // Previous from January is December of the year before — the boundary `shiftMonth`
    // exists for, asserted here through the real link rather than the unit test's maths.
    await page.getByRole('link', { name: 'Önceki ay' }).click()
    await expect(page).toHaveURL(/yil=2025&ay=12/)
    await expect(page.getByText('Aralık 2025')).toBeVisible()

    await page.reload()
    await expect(page.getByText('Aralık 2025')).toBeVisible()
  })

  test('a garbled month lands on the current one rather than erroring', async ({ page }) => {
    await signInManufacturer(page)
    const id = await companyId()

    const response = await page.goto(`/panel/${id}/takvim?yil=hayir&ay=99`)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Takvim' })).toBeVisible()
  })

  test('a scheduled survey appears on its Istanbul day and links to the request', async ({
    page,
  }) => {
    const id = await companyId()

    const [request] = await pgQuery<{ id: string }>(
      `SELECT "id" FROM "OfferRequest" WHERE "companyId" = $1 LIMIT 1`,
      [id],
    )
    if (request === undefined) test.skip(true, 'seed demo has no offer request for this company')

    /*
     * 21:30 UTC is 00:30 the NEXT day in Istanbul. Planting it here rather than at noon is
     * the whole point: a grid built from UTC parts files this on the 14th, and the
     * manufacturer arrives a day late for a survey.
     */
    const at = '2026-07-14T21:30:00.000Z'
    await pgQuery(
      `INSERT INTO "Appointment" ("id","offerRequestId","scheduledAt","durationMin","status","createdAt","updatedAt")
       VALUES ($1,$2,$3,60,'SCHEDULED',now(),now())
       ON CONFLICT ("id") DO UPDATE SET "scheduledAt" = EXCLUDED."scheduledAt"`,
      [`apt_e2e_calendar_${request?.id}`, request?.id, at],
    )

    await signInManufacturer(page)
    await page.goto(`/panel/${id}/takvim?yil=2026&ay=7`)

    // The chip carries the event kind in its title attribute; finding it by that proves
    // both that the event rendered and that it was classified as a survey.
    const chip = page.locator('[title^="Keşif randevusu"]').first()
    await expect(chip).toBeVisible()
    await expect(chip).toHaveAttribute('href', new RegExp(`/talepler/${request?.id}$`))
  })

  test('the legend names three kinds — the domain has three, not the design four', async ({
    page,
  }) => {
    await signInManufacturer(page)
    const id = await companyId()
    await page.goto(`/panel/${id}/takvim`)

    // ADR-034: "meetings" and "general/follow-up" have no entity behind them and are not
    // invented to fill a legend.
    await expect(page.getByText('Keşif randevusu').first()).toBeVisible()
    await expect(page.getByText('Yanıt süresi').first()).toBeVisible()
    await expect(page.getByText('Teklif geçerliliği').first()).toBeVisible()
  })
})
