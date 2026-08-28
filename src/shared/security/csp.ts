/**
 * The Content-Security-Policy, as a pure function of its inputs (`19` §App security).
 *
 * Lifted out of `middleware.ts` in task 13.5 for one reason: the policy now has a
 * **development branch**, and a branch that relaxes a security header is exactly the kind
 * of code that must be asserted rather than reviewed. `csp.test.ts` calls this directly;
 * `public-directory.spec.ts` asserts the header a real production server emits.
 *
 * ## Why there is a development branch at all
 *
 * `next dev` compiles with webpack's eval-based devtool, so the dev bundle evaluates
 * strings as JavaScript. Under the strict profile that is a CSP violation and the page
 * never hydrates:
 *
 *   EvalError: Evaluating a string as JavaScript violates the following Content Security
 *   Policy directive: "script-src 'self' 'nonce-…' 'strict-dynamic'"
 *
 * Which means every strict surface — `/giris`, `/kayit`, `/proje/*`, `/hesap`, `/panel/*`,
 * `/yonetim/*`, most of the application — has been **dead under `pnpm dev` since Phase 9**,
 * silently: the HTML renders, nothing is interactive, and no server-side log says a word.
 * Nobody noticed because the release gate runs `pnpm build && pnpm start`
 * (`playwright.config.ts`), which is the profile without the problem.
 *
 * 13.3's tunnel ran `pnpm dev`, so the E6 round would have walked a device into the same
 * wall on the web half.
 *
 * ## Why relax the policy rather than build for the tunnel
 *
 * The alternative was to have `scripts/tunnel.mjs` run `pnpm build && pnpm start`. That
 * fixes the device round and leaves the development server broken for everyone doing web
 * work — a minute of build on every change, or no strict page at all. The relaxation is
 * bounded to a branch that cannot be taken in a production build: `NODE_ENV` is inlined by
 * the compiler, so a production bundle contains the strict string and no path to the other
 * one. `'unsafe-eval'` permits evaluating strings; it does not permit injected inline
 * script, which is what the nonce is for and what stays enforced in both profiles.
 *
 * The cost is honest and is the reason for the test: there are now two policies, and only
 * one of them ships.
 */

/**
 * The object-storage origin(s) the browser is allowed to reach — **derived, never
 * hardcoded** (task 13.4).
 *
 * `14` §Upload flow sends the bytes from the browser **straight to storage**: the page
 * presigns, then `PUT`s to `uploadUrl`, which is a different origin from the application.
 * `connect-src 'self'` blocked exactly that, so every upload in the product died at the CSP
 * with no server-side trace — see `e2e/attachment-upload.spec.ts`.
 *
 * The origins come from `S3_ENDPOINT` (presigned PUT and signed private reads) and
 * `CDN_BASE_URL` (public reads) rather than a literal, because 13.3's tunnel gives MinIO a
 * fresh `https://<random>.trycloudflare.com` on every run — a hardcoded `localhost:9000` is
 * a policy that is correct only on the developer's own machine and silently wrong on the
 * phone. Two variables, because a real CDN is not the S3 endpoint; deduplicated, because
 * locally they are.
 *
 * Read from `process.env` rather than through `shared/config/env`: this runs in the Edge
 * runtime on every request, and that module parses the *whole* environment and throws on
 * the first missing secret — a config typo in an unrelated variable would become a
 * site-wide middleware outage. Same argument as `next.config.ts`'s `imageHosts()`, which
 * derives the image host from the same variable. Both are public hostnames, not secrets.
 *
 * The `localhost:9000` fallback applies **only when neither variable is set**, which the
 * typed env forbids at startup anyway. It exists so a developer who bypasses that path
 * still gets a working policy, not so production quietly permits a host it does not use —
 * which is what the old img-src literal did.
 */
export const STORAGE_FALLBACK_ORIGIN = 'http://localhost:9000'

export function storageOrigins(): string[] {
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
 * `next dev`'s bundle needs `'unsafe-eval'`, and nothing else: the nonce already covers
 * Next's inline scripts in both profiles, and the HMR socket is same-origin, which CSP3's
 * `'self'` matches for `ws:`.
 */
const DEVELOPMENT_SCRIPT_SOURCES = ["'unsafe-eval'"]

export type CspInput = {
  /** The nonce'd, script-src-carrying profile — the surfaces that handle personal data. */
  strict: boolean
  nonce: string
  /**
   * Defaults to `process.env.NODE_ENV !== 'production'`, which the compiler inlines: a
   * production bundle has no path to the relaxed branch. Passed explicitly by the test.
   */
  development?: boolean
  /** Defaults to the configured storage; passed explicitly by the test. */
  storage?: string[]
}

export function contentSecurityPolicy({
  strict,
  nonce,
  development = process.env.NODE_ENV !== 'production',
  storage = storageOrigins(),
}: CspInput): string {
  const storageList = storage.join(' ')

  const shared = [
    `style-src 'self' 'unsafe-inline'`,
    // CMS image blocks are https-anywhere by schema; a local (or tunnelled) MinIO is
    // served over the configured storage origin, which may be plain http in development.
    `img-src 'self' https: data: ${storageList}`,
    `font-src 'self'`,
    // 'self' plus storage: `14` §Upload flow PUTs the bytes from the browser to the
    // presigned URL, which is never this origin.
    `connect-src 'self' ${storageList}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ]

  if (!strict) return shared.join('; ')

  const scriptSources = [
    `'self'`,
    `'nonce-${nonce}'`,
    // strict-dynamic: the nonce'd bootstrap may load the chunks it imports.
    `'strict-dynamic'`,
    ...(development ? DEVELOPMENT_SCRIPT_SOURCES : []),
  ]

  return [`default-src 'self'`, `script-src ${scriptSources.join(' ')}`, ...shared].join('; ')
}
