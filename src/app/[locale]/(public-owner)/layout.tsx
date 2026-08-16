import type { ReactNode } from 'react'

/**
 * `(public-owner)` — public routes that carry **one owner's personal data**.
 *
 * ## Why this group exists
 *
 * `ADR-021` put the configurator on a public path so a visitor can configure without an
 * account. That left `(public)` holding two incompatible things: catalogue pages, which
 * `SEO-01` wants crawled and ISR-cached, and a customer's project, which must never be cached
 * at all. `07-frontend-architecture.md` §Rendering strategy describes the split — this
 * directory is that split, made real.
 *
 * The group exists so the rule is **structural rather than nominal**.
 * `scripts/check-dynamic-routes.mjs` used to name two routes; the second half of Phase 4 adds
 * `POST /claim`, attachments and probably a summary route, and every one of them would have
 * had to be remembered. Enumerating the directory instead means adding a route here cannot
 * forget the guarantee, and adding one *outside* here is a deliberate statement that it holds
 * no personal data.
 *
 * Parentheses keep it out of the URL: `/proje/yeni` is unchanged.
 *
 * **Anything placed here must be uncacheable.** The layout sets `force-dynamic` for the whole
 * group; a page may repeat it, and none may set `revalidate`.
 */
export const dynamic = 'force-dynamic'

/** A form, not content. `SEO-01` wants the catalogue crawled, not draft configurations. */
export const metadata = { robots: { index: false, follow: false } }

export default function PublicOwnerLayout({ children }: { children: ReactNode }) {
  return children
}
