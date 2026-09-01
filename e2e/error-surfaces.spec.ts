import { expect, test } from '@playwright/test'

/**
 * The 404, in both locales — task 14.2, `404_page_not_found`.
 *
 * Until now `notFound()` rendered **Next's built-in page**: unbranded, unstyled, English
 * whatever the locale. Five pages call it deliberately — an unsupplied city
 * (`/sehirler/[slug]`), an unknown category, the three owner-scoped ones — so it was the
 * answer to a supported question, rendered by a stranger.
 *
 * The status code is asserted first and separately from the body, because those are two
 * different failures: a page that *looks* like a 404 and answers 200 is worse than the
 * default page, since every crawler believes it.
 *
 * The error boundary is not exercised here. Triggering it needs a route that throws on
 * purpose, and a throwing route is a production surface; its contract — that nothing but
 * `digest` reaches the browser — is asserted statically in `test/error-boundary.test.ts`.
 */
test.describe('14.2 · the 404', () => {
  test('answers 404, not 200, for a path that does not exist', async ({ request }) => {
    const response = await request.get('/bu-sayfa-hicbir-zaman-olmadi')
    expect(response.status(), 'a soft 404 is believed by every crawler').toBe(404)
  })

  test('renders the branded page in Turkish', async ({ page }) => {
    await page.goto('/bu-sayfa-hicbir-zaman-olmadi')

    await expect(page.getByRole('heading', { name: 'Bu sayfa yok' })).toBeVisible()
    await expect(page.getByText('Bağlantı eski olabilir')).toBeVisible()

    // The two ways out, and they must actually go somewhere.
    await expect(page.getByRole('link', { name: 'Ana sayfaya git' })).toHaveAttribute('href', '/')
    await expect(page.getByRole('link', { name: 'Ürünlere göz at' })).toHaveAttribute(
      'href',
      '/kategoriler',
    )
  })

  test('renders it in English under /en', async ({ page }) => {
    await page.goto('/en/this-page-never-existed')

    await expect(page.getByRole('heading', { name: 'This page doesn’t exist' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Go to homepage' })).toHaveAttribute('href', '/en')
  })

  test('a deliberate notFound() from a real page lands here too', async ({ page }) => {
    // `/sehirler/[slug]` 404s for a city with no supply — the case `public-directory.spec.ts`
    // already covers for status. What is new is that it now renders OUR page.
    const response = await page.goto('/sehirler/boyle-bir-sehir-yok')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: 'Bu sayfa yok' })).toBeVisible()
  })

  test('the onward links come from the public nav, not a second copy', async ({ page }) => {
    await page.goto('/bu-sayfa-hicbir-zaman-olmadi')

    const elsewhere = page.getByRole('navigation', { name: 'Başka yerlere' })
    await expect(elsewhere.getByRole('link', { name: 'Ürünler' })).toBeVisible()
    await expect(elsewhere.getByRole('link', { name: 'Nasıl çalışır' })).toBeVisible()
    await expect(elsewhere.getByRole('link', { name: 'Üreticiler' })).toBeVisible()
    await expect(elsewhere.getByRole('link', { name: 'Şehirler' })).toBeVisible()
  })
})
