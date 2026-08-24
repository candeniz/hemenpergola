import { expect, test } from '@playwright/test'

/**
 * The public directory pages — task 8.1 — and the slug-redirect contract at the HTTP
 * level — task 8.5. Both locales render (`CLAUDE.md` §Definition of done), and a
 * redirected slug answers with a **permanent** redirect status plus the new location,
 * asserted with redirects disabled so the status itself is the evidence.
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

test.describe('public directory renders in both locales', () => {
  test('the category grid, in tr and en', async ({ page }) => {
    await page.goto('/kategoriler')
    await expect(page.getByRole('heading', { level: 1, name: 'Ürün kategorileri' })).toBeVisible()

    await page.goto('/en/kategoriler')
    await expect(page.getByRole('heading', { level: 1, name: 'Product categories' })).toBeVisible()
  })

  test('a category and a product from the real catalogue', async ({ page }) => {
    const [category] = await pgQuery<{ slug: string; name: string }>(
      `SELECT ct."slug", ct."name"
       FROM "CategoryTranslation" ct
       JOIN "Category" c ON c."id" = ct."categoryId"
       WHERE ct."locale" = 'tr' AND c."isActive" = true
       ORDER BY c."sortOrder" ASC LIMIT 1`,
      [],
    )
    expect(category).toBeDefined()

    await page.goto(`/kategoriler/${category!.slug}`)
    await expect(page.getByRole('heading', { level: 1, name: category!.name })).toBeVisible()

    const [product] = await pgQuery<{ slug: string; name: string }>(
      `SELECT pt."slug", pt."name"
       FROM "ProductTranslation" pt
       JOIN "Product" p ON p."id" = pt."productId"
       WHERE pt."locale" = 'tr' AND p."isActive" = true
       ORDER BY p."sortOrder" ASC LIMIT 1`,
      [],
    )
    expect(product).toBeDefined()

    await page.goto(`/urunler/${product!.slug}`)
    await expect(page.getByRole('heading', { level: 1, name: product!.name })).toBeVisible()
    // The product page carries its JSON-LD.
    expect(await page.content()).toContain('"@type":"Product"')
  })

  test('the manufacturer directory and a profile with the three-review rule', async ({ page }) => {
    await page.goto('/ureticiler')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Doğrulanmış üreticiler' }),
    ).toBeVisible()

    const [company] = await pgQuery<{ slug: string; displayName: string; reviewCount: number }>(
      `SELECT "slug", "displayName", "reviewCount"
       FROM "Company" WHERE "status" = 'VERIFIED' AND "deletedAt" IS NULL
       ORDER BY "displayName" ASC LIMIT 1`,
      [],
    )
    expect(company).toBeDefined()

    await page.goto(`/ureticiler/${company!.slug}`)
    await expect(page.getByRole('heading', { level: 1, name: company!.displayName })).toBeVisible()

    if (company!.reviewCount < 3) {
      // Below three published reviews there is NO average anywhere on the page —
      // the seeded companies have none, which makes them the rule's natural fixture.
      await expect(page.getByText('Platformda yeni').first()).toBeVisible()
      expect(await page.content()).not.toContain('AggregateRating')
    }
  })
})

test.describe('8.5 · a moved slug answers with a permanent redirect', () => {
  test('old category slug → 308 with the new location', async ({ request }) => {
    // Rename a fixture category the way the admin service does: new slug live, old slug
    // in SlugRedirect. Done in SQL because the release-gate e2e asserts outcomes, and the
    // service path that writes these rows is already locked by the integration suite.
    const [category] = await pgQuery<{ id: string; slug: string }>(
      `SELECT ct."categoryId" AS "id", ct."slug"
       FROM "CategoryTranslation" ct
       JOIN "Category" c ON c."id" = ct."categoryId"
       WHERE ct."locale" = 'tr' AND c."isActive" = true
       ORDER BY c."sortOrder" ASC LIMIT 1`,
      [],
    )
    expect(category).toBeDefined()

    const oldSlug = `eski-slug-e2e-${Date.now()}`
    await pgQuery(
      `INSERT INTO "SlugRedirect" ("id", "entityType", "locale", "oldSlug", "entityId")
       VALUES ($1, 'category', 'tr', $2, $3)
       ON CONFLICT ("entityType", "locale", "oldSlug") DO UPDATE SET "entityId" = $3`,
      [`slugred_${Date.now()}`, oldSlug, category!.id],
    )

    const response = await request.get(`/kategoriler/${oldSlug}`, {
      maxRedirects: 0,
    })

    // Next's permanentRedirect answers 308 — the permanent class, which is what `18`
    // §URLs requires; the exact code is the framework's choice and 308 preserves method.
    expect(response.status()).toBe(308)
    expect(response.headers()['location']).toContain(`/kategoriler/${category!.slug}`)

    await pgQuery(`DELETE FROM "SlugRedirect" WHERE "oldSlug" = $1`, [oldSlug])
  })
})
