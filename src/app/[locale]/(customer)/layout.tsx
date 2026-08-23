import { redirect } from '@/i18n/navigation'

/**
 * The `(customer)` gate — **Q24, closed here**.
 *
 * ## The bug this fixes
 *
 * `07-frontend-architecture.md` §Rendering strategy has described this segment as *"SSR,
 * dynamic, auth-gated"* since Phase 0, and nothing gated it. `middleware.ts` does locale
 * negotiation only — correctly, because it runs on the edge and authorisation needs the
 * database (`12` §Authorization) — and there was no layout to do the rest. `/hesap` rendered
 * for anybody who typed it.
 *
 * Nothing leaked, which is why it survived four phases: every page loaded its data through a
 * service that scopes by ownership, so an unauthenticated visitor met an empty shell rather
 * than somebody else's data. Task 4.8 is what changes the arithmetic — the dashboard renders
 * a customer's project list, and "the page is harmless because it shows nothing" stops being
 * true the moment a page shows something.
 *
 * It was found by writing a test. The natural assertion for session revocation is *"a
 * protected page redirects"*, and it proved nothing at all here, because no page was
 * protected.
 *
 * ## Why the layout and not the middleware
 *
 * `12` §Authorization splits the two jobs and this is the split: **middleware authenticates
 * and redirects; it does not authorise.** A layout runs on the server with a database
 * connection, so it can resolve a real actor. A middleware matcher for `/hesap` would have to
 * either trust an unverified cookie — a signed-out user with a stale value walks straight in —
 * or open a database connection on the edge, which `23` §Runtime does not provide.
 *
 * ## What this is not
 *
 * It is **not** the authorisation. Every page under here still loads its data through a
 * service that scopes by ownership, and that is what actually protects the rows. This gate
 * decides who gets to see a *shell*, and it exists so that "auth-gated" in `07` describes a
 * mechanism rather than an intention. Removing it should break a test, not a wall.
 *
 * `/proje/[id]` is deliberately outside it (`ADR-021`): the configurator is public, and the
 * account wall stands at "get offers".
 */
export default async function CustomerSegmentLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  const [{ resolveActor }, { headers }] = await Promise.all([
    import('@/shared/context/actor'),
    import('next/headers'),
  ])

  const requestHeaders = await headers()
  const actor = await resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    { locale },
  )

  /*
   * `/giris` and not `/yetkisiz`: an anonymous visitor has not been refused, they have not
   * been asked yet. `03` §F-auth sends the unknown visitor to sign-in and the *known but
   * unpermitted* one to the forbidden page, and conflating the two tells a signed-out
   * customer they lack a permission they in fact hold.
   */
  if (actor.userId === null) redirect({ href: '/giris', locale })

  return <>{children}</>
}
