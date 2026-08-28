import { NextResponse, type NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'

import { routing } from './i18n/routing'

/**
 * Locale negotiation + the security headers (task 9.3, `19` §App security). Still NO
 * authentication or authorisation here: middleware runs on the edge without database
 * access (`12` §Authorization).
 *
 * ## CSP — nonce-based, and why not 'unsafe-inline'
 *
 * A CSP carrying `unsafe-inline` for scripts is theatre: the one thing CSP exists to stop
 * is injected inline script, and that keyword re-allows it. So: a fresh 128-bit nonce per
 * request, passed to Next via the `x-nonce` request header — the App Router reads the
 * nonce out of the CSP header and stamps it onto every inline script it emits (the RSC
 * flight bootstrap included) — plus `'strict-dynamic'`, so nonce-approved scripts may
 * load the chunks they legitimately import.
 *
 * `style-src` carries `'unsafe-inline'` deliberately and with narrow eyes: React style
 * ATTRIBUTES are not affected by CSP at all, but next/font and the framework emit real
 * inline `<style>` tags that have no nonce path in Next today. Inline STYLE injection is
 * not script execution — the attack CSP's script half exists for — and the CMS renderer
 * never emits styles from content (`blocks.test.ts`). Scripts carry no such exception.
 *
 * The proof this breaks nothing is the release gate: every Playwright run — core-flow's
 * nine steps included — now executes under this exact policy, and
 * `public-directory.spec.ts` asserts the headers and the absence of `unsafe-inline` in
 * `script-src` explicitly.
 */

const intl = createMiddleware(routing)

/**
 * The object-storage origin(s) the browser is allowed to reach — **derived, never
 * hardcoded** (task 13.4).
 *
 * `14` §Upload flow sends the bytes from the browser **straight to storage**: the page
 * presigns, then `PUT`s to `uploadUrl`, which is a different origin from the application.
 * `connect-src 'self'` blocks exactly that, so every upload in
 * `components/project/attachments.tsx` and `components/manufacturer/supply-forms.tsx` died
 * at the CSP with no server-side trace. It went unseen since Phase 9 because no e2e test
 * uploaded a file; `attachment-upload.spec.ts` is now the one that would.
 *
 * The origins come from `S3_ENDPOINT` (presigned PUT and signed private reads) and
 * `CDN_BASE_URL` (public reads) rather than a literal, because 13.3's tunnel gives MinIO a
 * fresh `https://<random>.trycloudflare.com` on every run — a hardcoded `localhost:9000`
 * is a policy that is correct only on the developer's own machine and silently wrong on
 * the phone. Two variables, because a real CDN is not the S3 endpoint; deduplicated,
 * because locally they are.
 *
 * Read from `process.env` rather than through `shared/config/env`: this runs in the Edge
 * runtime on every request, and that module parses the *whole* environment and throws on
 * the first missing secret — a config typo in an unrelated variable would become a
 * site-wide middleware outage. Same argument as `next.config.ts`'s `imageHosts()`, which
 * derives the image host from the same variable. Both are public hostnames, not secrets.
 *
 * The `localhost:9000` fallback applies **only when neither variable is set**, which the
 * typed env forbids at startup anyway (`REQUIRED_SERVER_KEYS`). It exists so a developer
 * who bypasses that path still gets a working policy, not so production quietly permits a
 * host it does not use — which is what the old img-src literal did.
 */
const STORAGE_FALLBACK_ORIGIN = 'http://localhost:9000'

function storageOrigins(): string[] {
  const origins = new Set<string>()

  for (const configured of [process.env.S3_ENDPOINT, process.env.CDN_BASE_URL]) {
    if (configured === undefined || configured === '') continue
    try {
      origins.add(new URL(configured).origin)
    } catch {
      // A malformed URL must not take every request down; the origin is simply not
      // allowed, and the browser reports the block with the offending URL in it.
    }
  }

  return origins.size === 0 ? [STORAGE_FALLBACK_ORIGIN] : [...origins]
}

/**
 * The paths that get the STRICT (nonce'd script-src) profile — every surface that renders
 * or collects personal data. These are all dynamically rendered (the auth pages were made
 * `force-dynamic` for exactly this), which is the precondition: Next stamps the nonce
 * onto its inline scripts only at request-time render.
 *
 * The ISR public pages CANNOT carry a script nonce — a per-request nonce and a cached
 * page are mutually exclusive by construction, and Next's flight bootstrap is inline. So
 * their profile omits `script-src` entirely rather than lying with `'unsafe-inline'`
 * (which a nonce-bearing browser ignores anyway) or breaking hydration with a policy the
 * cached HTML cannot satisfy. Every other directive still applies there. Recorded in `19`
 * and the launch checklist: closing this gap means a JS-free public shell or PPR — a
 * deliberate architecture decision, not a middleware tweak.
 */
const STRICT_PREFIXES = [
  '/proje',
  '/hesap',
  '/panel',
  '/yonetim',
  '/giris',
  '/kayit',
  '/sifre-sifirla',
  '/sifre-yenile',
  '/eposta-dogrula',
  '/telefon-dogrula',
]

function isStrictPath(pathname: string): boolean {
  const unprefixed = pathname.startsWith('/en/')
    ? pathname.slice(3)
    : pathname === '/en'
      ? '/'
      : pathname
  return STRICT_PREFIXES.some(
    (prefix) => unprefixed === prefix || unprefixed.startsWith(`${prefix}/`),
  )
}

export default function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')
  const strict = isStrictPath(request.nextUrl.pathname)

  const storage = storageOrigins().join(' ')

  const shared = [
    `style-src 'self' 'unsafe-inline'`,
    // CMS image blocks are https-anywhere by schema; a local (or tunnelled) MinIO is
    // served over the configured storage origin, which may be plain http in development.
    `img-src 'self' https: data: ${storage}`,
    `font-src 'self'`,
    // 'self' plus storage: `14` §Upload flow PUTs the bytes from the browser to the
    // presigned URL, which is never this origin.
    `connect-src 'self' ${storage}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ]

  const csp = strict
    ? [
        `default-src 'self'`,
        // strict-dynamic: the nonce'd bootstrap may load the chunks it imports.
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
        ...shared,
      ].join('; ')
    : shared.join('; ')

  // Next reads the nonce from the REQUEST's CSP header and applies it to its inline
  // scripts — so the header must ride the request that reaches the route, through
  // next-intl's rewrite. `createMiddleware` offers no hook for that, so the composition
  // rebuilds its verdict: a redirect passes through untouched, a rewrite (or pass) is
  // re-issued with our request headers attached.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)

  const intlResponse = intl(request)

  let response: NextResponse
  const rewriteTarget = intlResponse?.headers.get('x-middleware-rewrite')
  if (intlResponse !== null && intlResponse.status >= 300 && intlResponse.status < 400) {
    response = intlResponse // a locale redirect; the next request comes back through here
  } else if (rewriteTarget !== null && rewriteTarget !== undefined) {
    response = NextResponse.rewrite(rewriteTarget, { request: { headers: requestHeaders } })
    // Carry next-intl's own response headers (the locale cookie) onto the rebuilt rewrite.
    intlResponse?.headers.forEach((value, header) => {
      if (header !== 'x-middleware-rewrite') response.headers.set(header, value)
    })
    intlResponse?.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } })
    intlResponse?.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
  }

  response.headers.set('content-security-policy', csp)
  response.headers.set('x-content-type-options', 'nosniff')
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()')
  response.headers.set('strict-transport-security', 'max-age=63072000; includeSubDomains')

  return response
}

export const config = {
  // Everything except Next internals, the API surface and files with an extension.
  //
  // The `\\.` must survive into the regex: written as a single backslash in a JS string it
  // collapses to a bare `.`, the group becomes "any path with two or more characters", and
  // every unprefixed Turkish route falls out of the middleware and 404s. Only `/` works,
  // which makes it look like locale routing is fine.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
