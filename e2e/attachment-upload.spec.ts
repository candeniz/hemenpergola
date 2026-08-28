import { expect, test } from '@playwright/test'

import { startDraft, walkToAttachments } from './wizard-walk'

/**
 * Task 13.4 — **the browser→storage upload leg, which no test had ever exercised.**
 *
 * `14` §Upload flow sends the bytes from the page straight to object storage: presign,
 * `PUT` to the presigned URL, complete. That URL is a *different origin* from the
 * application, and `middleware.ts` shipped `connect-src 'self'` from Phase 9 — so every
 * upload in the product was blocked by the CSP, in every browser, since the day the header
 * landed. Nothing caught it: the failure is client-side (`net::ERR_BLOCKED_BY_CSP`), the
 * server sees no request at all, and not one e2e spec had ever attached a file.
 *
 * This spec is the missing coverage, in two halves that fail for different reasons:
 *
 *   - the **header** test fails if the policy stops naming the storage origin — a fast,
 *     deterministic check that does not depend on storage being reachable;
 *   - the **upload** test fails if the round trip breaks for any other reason, and it
 *     watches the browser console so a re-introduced CSP block is reported as a CSP block
 *     rather than as a mystery timeout.
 *
 * The origin is derived, never hardcoded, on both sides: 13.3's tunnel hands MinIO a fresh
 * `https://<random>.trycloudflare.com` per run, so a literal `localhost:9000` is a policy
 * that is right only on the developer's machine.
 */

/** A real 70-byte PNG (not a fake buffer): `media.process` decides MIME from content. */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/**
 * The Playwright process does not load `.env` — the server does. `.env.example` and
 * `docker-compose.yml` agree on this origin, and CI writes `.env` from the example, so it
 * is what the server under test is configured with in every environment this suite runs in.
 */
const STORAGE_ORIGIN = new URL(process.env.S3_ENDPOINT ?? 'http://localhost:9000').origin

test.describe('13.4 · uploads reach storage', () => {
  test('the CSP names the storage origin in connect-src and img-src', async ({ request }) => {
    const response = await request.get('/proje/yeni')
    const csp = response.headers()['content-security-policy'] ?? ''

    // connect-src is the one that decides whether the PUT happens at all.
    const connectSrc = /connect-src[^;]*/.exec(csp)?.[0] ?? ''
    expect(connectSrc, csp).toContain(STORAGE_ORIGIN)
    // 'self' stays: every other fetch on the page is same-origin.
    expect(connectSrc).toContain("'self'")

    // img-src used to carry a hardcoded localhost:9000; it is derived from the same
    // configuration now, so a tunnelled or deployed storage host renders too.
    const imgSrc = /img-src[^;]*/.exec(csp)?.[0] ?? ''
    expect(imgSrc, csp).toContain(STORAGE_ORIGIN)
  })

  test('a photo goes from the file input to storage and back onto the step', async ({ page }) => {
    /*
     * A CSP block surfaces ONLY here — the server never sees the request. Without this
     * listener the failure below is an unexplained timeout, which is how the bug survived.
     */
    const blocked: string[] = []
    page.on('console', (message) => {
      if (/content security policy|refused to connect|ERR_BLOCKED_BY_CSP/i.test(message.text())) {
        blocked.push(message.text())
      }
    })

    await startDraft(page)
    await walkToAttachments(page, 'İstanbul')

    await page
      .getByLabel('Fotoğraf veya belge ekle')
      .setInputFiles({ name: 'saha.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG })

    /*
     * The attachment list is rendered from the view the server returns after
     * `addAttachment`, so the row appearing means all four calls landed: presign, the
     * cross-origin PUT, complete, link. A blocked PUT stops at step two.
     *
     * Polled against *either* outcome rather than waited for with `toBeVisible`, so that a
     * CSP block fails with the browser's own sentence in the diff instead of an
     * unexplained timeout. That distinction is the whole reason this spec exists.
     */
    const row = page.getByText(/Fotoğraf ·/).first()
    await expect
      .poll(
        async () => {
          if (blocked.length > 0) return blocked[0]
          return (await row.count()) > 0 ? 'uploaded' : 'pending'
        },
        { timeout: 30_000 },
      )
      .toBe('uploaded')
  })
})
