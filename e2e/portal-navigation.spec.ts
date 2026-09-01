import { expect, test, type Page } from '@playwright/test'

import { SEED_MANUFACTURER_EMAIL } from '../prisma/seed/accounts'
import { adminNav, customerNav, manufacturerNav } from '../src/components/layouts/nav-items'

/**
 * **Every navigation link, clicked** — task 13.8.
 *
 * `nav-items.test.ts` proves a page file exists on disk. That is a different claim from *the
 * link works*: a page can exist and still 500 on a guard, a bad service call or a missing
 * translation, and the release gate would not notice — `core-flow.spec.ts` walks straight to
 * `/panel/{id}/talepler` and **never presses "Panel"**, which is exactly how the portal's own
 * landing page 404'd from Phase 3 to 13.8 without a single red test.
 *
 * So this walks the shells the way a person does: sign in, then visit every entry in the
 * navigation and insist on a 200. The list comes from `nav-items.ts` itself, so a link added
 * tomorrow is walked tomorrow without anyone remembering to add it here.
 *
 * Signed in through the session fixture rather than the form — `06` §Rate limits gives ten
 * auth attempts per account per fifteen minutes, and the real auth specs already spend them.
 */

async function pgQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
  const { Client } = await import('pg')
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ?? 'postgresql://pergola:pergola@localhost:5432/pergola',
  })
  await client.connect()
  try {
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.end()
  }
}

async function signIn(page: Page, email: string): Promise<void> {
  const { seedSessionCookie } = await import('./session-fixture')
  await seedSessionCookie(page, email)
}

async function companyId(): Promise<string> {
  const [row] = await pgQuery<{ id: string }>(
    `SELECT c."id" FROM "Company" c
     JOIN "CompanyMembership" m ON m."companyId" = c."id"
     JOIN "User" u ON u."id" = m."userId"
     WHERE u."email" = $1 LIMIT 1`,
    [SEED_MANUFACTURER_EMAIL],
  )
  if (row === undefined) throw new Error('run `pnpm seed demo` first')
  return row.id
}

test.describe('13.8 · every navigation link answers', () => {
  test('the manufacturer portal, including the one nobody clicked', async ({ page }) => {
    await signIn(page, SEED_MANUFACTURER_EMAIL)
    const id = await companyId()

    for (const item of manufacturerNav) {
      const href = `/panel/${id}${item.href}`
      const response = await page.goto(href)
      expect(response?.status(), `${href} (nav.manufacturer.${item.labelKey})`).toBe(200)
    }
  })

  test('the portal dashboard is what a sign-in lands on, and it counts', async ({ page }) => {
    await signIn(page, SEED_MANUFACTURER_EMAIL)
    const id = await companyId()

    await page.goto(`/panel/${id}`)
    await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible()

    // The five headline counts and the funnel — the whole point of the page. Their presence
    // proves the service answered; an empty shell would render neither.
    await expect(page.getByText('Yeni talep')).toBeVisible()
    await expect(page.getByText('Kazanılan').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Dönüşüm hunisi' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Son talepler' })).toBeVisible()
  })

  test('/panel redirects a single-company member straight to their panel', async ({ page }) => {
    await signIn(page, SEED_MANUFACTURER_EMAIL)
    const id = await companyId()

    await page.goto('/panel')
    // No decision to make, so no page asking for one.
    await expect(page).toHaveURL(new RegExp(`/panel/${id}$`))
  })

  test('the customer shell', async ({ page }) => {
    const { SEED_CUSTOMER_EMAIL } = await import('../prisma/seed/accounts')
    await signIn(page, SEED_CUSTOMER_EMAIL)

    for (const item of customerNav) {
      const response = await page.goto(item.href)
      expect(response?.status(), `${item.href} (nav.customer.${item.labelKey})`).toBe(200)
    }
  })

  test('the admin shell', async ({ page }) => {
    const { SEED_ADMIN_EMAIL } = await import('../prisma/seed/accounts')
    await signIn(page, SEED_ADMIN_EMAIL)

    for (const item of adminNav) {
      const response = await page.goto(item.href)
      expect(response?.status(), `${item.href} (nav.admin.${item.labelKey})`).toBe(200)
    }
  })
})
