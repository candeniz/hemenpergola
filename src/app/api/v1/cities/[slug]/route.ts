import { REFERENCE_CACHE, respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/cities/{slug}` — one city landing page: the city and its manufacturer
 * cards (`18` §Cities).
 *
 * The static siblings `districts` and `pages` win the route match over this dynamic
 * segment, which is safe because no Turkish province slugifies to either word. A city
 * without supply answers `NOT_FOUND` — the page does not exist, rather than existing
 * empty (`18`'s rule, enforced in the service's supplied-city filter).
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const [{ getPublicCity }, { resolveActor }] = await Promise.all([
    import('@/modules/directory/application/directory-service'),
    import('@/shared/context/actor'),
  ])

  const { slug } = await params
  return respond(await getPublicCity(await resolveActor(request), { slug }), undefined, {
    cacheControl: REFERENCE_CACHE,
  })
}
