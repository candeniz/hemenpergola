import { expect, test, type Page } from '@playwright/test'

/**
 * F2 · customer account — `20-testing-strategy.md` §End to end, secondary spec 1.
 *
 * This is the spec the Phase 1 gate requires to stop being `fixme` and actually run:
 * registration → email verification → login → password reset, through the real screens,
 * against a production build.
 *
 * **The mailbox.** A verification link is a single-use token that only exists in an email,
 * and the token is stored hashed — the database cannot give it back. The test reads
 * `/api/dev/mailbox`, which is the `log` adapter's buffer and 404s outside development.
 * `20` §End to end already names a test-only endpoint as the accepted shape for this; the
 * alternative is a mail server in CI to test something that is not the mail server.
 */

/*
 * A Turkish browser, for every test that reads a Turkish page.
 *
 * `localePrefix: 'as-needed'' makes `/kayit` the Turkish route, but next-intl also negotiates
 * on `Accept-Language` by default — so Playwright's Chromium, which asks for `en-US`, is
 * redirected from `/kayit` to `/en/kayit` and reads English copy. That is next-intl behaving
 * as documented, not a routing fault; the first version of this file simply asserted Turkish
 * text against an English visitor.
 */
test.use({ locale: 'tr-TR' })

/*
 * 90 seconds. Registration is Argon2id at 19 MiB by design (`12` §Credentials), and this
 * file registers, verifies, signs in twice and resets a password in one test — the default
 * 30 seconds is a budget for a suite whose slowest operation is a page load.
 */
test.setTimeout(90_000)

/*
 * One client address per test.
 *
 * `06` §Rate limits allows ten auth requests per fifteen minutes **per IP**, and this suite
 * is fifteen tests all arriving from 127.0.0.1 — so the sixth test onwards met a 429 and the
 * screens dutifully reported "işlem tamamlanamadı". The limiter was right; the suite was
 * pretending to be one very busy person.
 *
 * `resolveActor` reads the first entry of `x-forwarded-for`, so declaring a distinct address
 * per test makes each one the separate visitor it actually represents. In production that
 * header is written by the load balancer (`23` §Runtime), not by the client.
 */
let addresses = 0

/*
 * The base octet is randomised **per run**, not just per test. Rate-limit counters live in
 * Postgres and the window is fifteen minutes, so a fixed address set makes the second
 * `pnpm test:e2e` inside a quarter of an hour fail on a limit the first one filled — a
 * flake that looks like a broken registration screen and is not.
 */
const RUN = Math.floor(Math.random() * 250)

test.beforeEach(async ({ page }, testInfo) => {
  addresses += 1
  await page.setExtraHTTPHeaders({
    'x-forwarded-for': `10.${RUN}.${testInfo.workerIndex + 1}.${addresses % 250}`,
  })
})

const PASSWORD = 'e2e-account-password-1'
const NEW_PASSWORD = 'e2e-account-password-2'

/** A fresh address per run, so a re-run is not a duplicate registration. */
function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`
}

type Mail = { to: string; subject: string; text: string; link: string | null }

async function mailFor(page: Page, address: string, subjectPart: string): Promise<Mail> {
  const response = await page.request.get('/api/dev/mailbox')
  expect(response.ok(), 'the dev mailbox must be reachable in a development build').toBe(true)

  const body = (await response.json()) as { data: Mail[] }
  const match = [...body.data]
    .reverse()
    .find((mail) => mail.to === address && mail.subject.includes(subjectPart))

  expect(match, `no "${subjectPart}" mail for ${address}`).toBeDefined()
  return match as Mail
}

/** The link, as a path — the mail carries an absolute URL built from `AUTH_URL`. */
function pathOf(link: string | null): string {
  expect(link, 'the mail must carry a link').not.toBeNull()
  const url = new URL(link as string)
  return `${url.pathname}${url.search}`
}

async function register(page: Page, email: string): Promise<void> {
  await page.goto('/kayit')

  await page.getByLabel('Ad soyad').fill('E2E Test')
  await page.getByLabel('E-posta').fill(email)
  await page.getByLabel('Şifre', { exact: true }).fill(PASSWORD)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Hesap oluştur' }).click()

  await expect(page.getByText('Hesabınız oluşturuldu')).toBeVisible({ timeout: 30_000 })
}

test.describe('F2 · customer account', () => {
  test('registration → email verification → login → password reset', async ({ page }) => {
    const email = uniqueEmail('account')

    // ── Register ──────────────────────────────────────────────────────────────
    await register(page, email)

    // ── Verify ────────────────────────────────────────────────────────────────
    const verification = await mailFor(page, email, 'doğrulayın')
    expect(verification.text).toContain('24 saat')

    await page.goto(pathOf(verification.link))
    await expect(page.getByText('E-posta adresiniz doğrulandı')).toBeVisible({ timeout: 30_000 })

    // The link is single-use: following it again must not report success.
    await page.goto(pathOf(verification.link))
    await expect(page.getByText('E-posta adresiniz doğrulandı')).toBeHidden({ timeout: 30_000 })

    // ── Log in ────────────────────────────────────────────────────────────────
    await page.goto('/giris')
    await page.getByLabel('E-posta').fill(email)
    await page.getByLabel('Şifre').fill(PASSWORD)
    await page.getByRole('button', { name: 'Giriş yap' }).click()

    // Not `getByRole('alert')`: Next renders its own `__next-route-announcer__` with that
    // role on every navigation, so the generic query is always satisfied and never means
    // what it looks like it means. Assert on the message the screen would actually show.
    await expect(page.getByText('E-posta veya şifre hatalı.')).toBeHidden({ timeout: 30_000 })

    // ── Reset the password ────────────────────────────────────────────────────
    await page.goto('/sifre-sifirla')
    await page.getByLabel('E-posta').fill(email)
    await page.getByRole('button', { name: 'Bağlantı gönder' }).click()
    await expect(page.getByText('Bağlantı gönderildi')).toBeVisible({ timeout: 30_000 })

    const reset = await mailFor(page, email, 'Şifre sıfırlama')
    await page.goto(pathOf(reset.link))

    await page.getByLabel('Yeni şifre').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Şifreyi güncelle' }).click()
    await expect(page.getByText('Şifreniz güncellendi')).toBeVisible({ timeout: 30_000 })

    // ── The new password works and the old one does not ───────────────────────
    await page.goto('/giris')
    await page.getByLabel('E-posta').fill(email)
    await page.getByLabel('Şifre').fill(PASSWORD)
    await page.getByRole('button', { name: 'Giriş yap' }).click()
    await expect(page.getByText('E-posta veya şifre hatalı.')).toBeVisible({ timeout: 30_000 })

    await page.getByLabel('Şifre').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Giriş yap' }).click()
    await expect(page.getByText('E-posta veya şifre hatalı.')).toBeHidden({ timeout: 30_000 })
  })

  test('a wrong reset link is refused without saying why', async ({ page }) => {
    await page.goto('/sifre-yenile?token=this-token-was-never-issued')

    await page.getByLabel('Yeni şifre').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Şifreyi güncelle' }).click()

    // "Expired", "already used" and "never existed" are one message on purpose.
    await expect(page.getByText('Bağlantı geçersiz veya süresi dolmuş')).toBeVisible({
      timeout: 30_000,
    })
  })

  test('a verification page with no token says where to find one', async ({ page }) => {
    await page.goto('/eposta-dogrula')

    await expect(
      page.getByText('Bu sayfaya e-postanızdaki bağlantıdan ulaşmanız gerekiyor.'),
    ).toBeVisible()
  })

  test('registration does not disclose whether an address already exists', async ({ page }) => {
    // The screen shows the same success panel either way; the difference goes to the
    // mailbox of whoever owns the address.
    const email = uniqueEmail('duplicate')
    await register(page, email)
    await register(page, email)

    const notice = await mailFor(page, email, 'Zaten bir hesabınız var')
    expect(notice.link).toContain('/sifre-yenile?token=')
  })
})

test.describe('03 §Failure paths', () => {
  test('permission denied → a 403 page, never a redirect loop', async ({ page }) => {
    /*
     * `03-user-flows.md` §Failure paths, screen `access_denied_permission_required`. A route
     * rather than only an error boundary, because a `FORBIDDEN` result has to land somewhere
     * a person can act from — and because a redirect to the login page for someone who *is*
     * signed in is the loop this row exists to forbid.
     */
    await page.goto('/yetkisiz?permission=company:price_book.publish')

    await expect(page.getByText('Bu sayfaya erişiminiz yok')).toBeVisible()
    await expect(page.getByText('company:price_book.publish')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Başka hesapla giriş yap' })).toBeVisible()

    // Landed, not bounced.
    expect(new URL(page.url()).pathname).toBe('/yetkisiz')
  })
})

const SCREENS = [
  ['/kayit', 'Hesap oluştur', '/en/kayit', 'Create an account'],
  ['/giris', 'Giriş yap', '/en/giris', 'Sign in'],
  ['/sifre-sifirla', 'Şifrenizi mi unuttunuz?', '/en/sifre-sifirla', 'Forgot your password?'],
  ['/telefon-dogrula', 'Telefonunuzu doğrulayın', '/en/telefon-dogrula', 'Verify your phone'],
  ['/yetkisiz', 'Bu sayfaya erişiminiz yok', '/en/yetkisiz', 'You do not have access to this page'],
] as const

test.describe('both locales render', () => {
  for (const [path, heading] of SCREENS.map(([p, h]) => [p, h] as const)) {
    test(`tr: ${path}`, async ({ page }) => {
      await page.goto(path)

      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
      // A missing key renders as its path rather than throwing, which is invisible in a
      // build that otherwise passes.
      await expect(page.locator('body')).not.toContainText('auth.')
    })
  }
})

test.describe('both locales render · en', () => {
  // An English browser, so the negotiated redirect agrees with the prefixed path.
  test.use({ locale: 'en-US' })

  for (const [path, heading] of SCREENS.map(([, , p, h]) => [p, h] as const)) {
    test(`en: ${path}`, async ({ page }) => {
      await page.goto(path)

      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
      await expect(page.locator('body')).not.toContainText('auth.')
    })
  }
})
