import { MODERATED_CACHE, respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/manufacturers` — the public directory (`06` §Public read).
 *
 * The full `VERIFIED` set, ranked by review count then name — the service takes no
 * filters, and `06`'s sketched `?city=&product=&q=` query params were corrected to match:
 * at the directory's current size the whole card list is one cacheable response and the
 * filtering is the client's. Server-side filters return when the directory outgrows one
 * response, as a change to `06` first.
 *
 * Cards carry the aggregate rating and city names, never contact details — those are
 * disclosed per engagement, not published (`19`).
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [{ listPublicManufacturers }, { resolveActor }] = await Promise.all([
    import('@/modules/directory/application/directory-service'),
    import('@/shared/context/actor'),
  ])

  return respond(await listPublicManufacturers(await resolveActor(request), {}), undefined, {
    cacheControl: MODERATED_CACHE,
  })
}
