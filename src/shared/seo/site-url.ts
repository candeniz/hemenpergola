/**
 * The site's public origin — `18` §URLs, task 8.4. **The domain is not decided yet**, so
 * nothing hardcodes one: canonical URLs, the sitemap and JSON-LD all read
 * `NEXT_PUBLIC_SITE_URL` through this one function, and the day the domain lands it is a
 * one-line `.env` change.
 *
 * Deliberately NOT the Zod-parsed env module: that parse is eager and this value is read
 * while `next build` prerenders public pages, where `23` §Configuration guarantees no
 * environment exists (the CI build job runs without `.env` to keep it that way). A soft
 * read with a dev fallback keeps the build honest and the production value configurable.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

/** An absolute URL under the site origin. `path` starts with `/`. */
export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path}`
}

/** The path prefix for a locale: `tr` is canonical and unprefixed (`ADR-018`). */
export function localePath(locale: string, path: string): string {
  return locale === 'en' ? `/en${path}` : path
}
