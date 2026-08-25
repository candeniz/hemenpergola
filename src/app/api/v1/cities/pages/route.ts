import { MODERATED_CACHE, respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/cities/pages` — the cities that have landing pages, which is to say the
 * cities with real supply (`18`, Q5: *"city landing pages exist only where real supply
 * exists"*).
 *
 * A different resource from `GET /cities` next door: that is the 81-province reference
 * list the location step needs; this is the handful with verified manufacturers, each
 * with its slug and count. Conflating them is how an empty city page gets built.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [{ listPublicCities }, { resolveActor }] = await Promise.all([
    import('@/modules/directory/application/directory-service'),
    import('@/shared/context/actor'),
  ])

  return respond(await listPublicCities(await resolveActor(request), {}), undefined, {
    cacheControl: MODERATED_CACHE,
  })
}
