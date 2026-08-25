import { REFERENCE_CACHE, respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/cities` — `06` §Catalogue (public), the 81 provinces.
 *
 * Anonymous by decision, not by omission: the service's own `why` records the Phase 3
 * gating that once hid this from the public wizard's location step. The vestigial
 * `companyId` that gating left in the schema is gone as of Phase 10.3 — see the service.
 *
 * **Cached, because it is reference data on the launch checklist's connection.** 81 rows
 * measure 1.7 KB gzipped; the cost was never the payload but the habit — `force-dynamic`
 * meant every phone ran the query and carried the bytes on every visit, on the mid-range
 * Android over a slow connection that `29` E6 tests against. An hour of freshness against
 * data that changes by seed script is not a trade-off. `force-dynamic` stays: it keeps the
 * handler out of the build (non-negotiable 9); the caching lives in the response header,
 * which is the API analog of the public pages' ISR (`05` §Caching).
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [{ listCities }, { resolveActor }] = await Promise.all([
    import('@/modules/matching/application/service-area-service'),
    import('@/shared/context/actor'),
  ])

  return respond(await listCities(await resolveActor(request), {}), undefined, {
    cacheControl: REFERENCE_CACHE,
  })
}
