import { redirect } from '@/i18n/navigation'

/**
 * The `(manufacturer)` gate — the other half of **Q24**.
 *
 * `07-frontend-architecture.md` §Rendering strategy calls this segment *"SSR, dynamic, auth +
 * company-scoped"*, and until now neither half was enforced by anything but the services
 * underneath. The company half genuinely belongs in the services — `resolveActor` reads
 * `[companyId]` from the route and `authorize()` turns a missing membership into `FORBIDDEN`,
 * which is `02` §Enforcement rule's *one* place — so this layout does the part a service
 * cannot: it decides whether an unauthenticated visitor is shown a panel shell at all.
 *
 * Deliberately **not** company-scoped here. A layout that also checked membership would be a
 * second authorisation point with its own copy of the rule, and `panel/[companyId]`'s pages
 * already fail correctly for a non-member. Two checks that agree today are two checks that
 * disagree after the next change.
 */
export default async function ManufacturerSegmentLayout({
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

  if (actor.userId === null) redirect({ href: '/giris', locale })

  return <>{children}</>
}
