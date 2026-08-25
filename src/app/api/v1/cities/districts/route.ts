import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/cities/districts` — all 974 districts, each carrying its `cityId`.
 *
 * `06` line 77 sketched this as `GET /cities/{id}/districts`, one province at a time. The
 * service answers the whole set in a single query and the page it was written for needs the
 * whole set — a location step lets the visitor change province, and per-province fetching
 * would turn one query into a round trip per keystroke. The path is flat for the same
 * reason: there is no `{id}` to address. `06` is corrected to match rather than the service
 * being reshaped to match `06`.
 *
 * Anonymous, and carrying the same vestigial `companyId` as `GET /cities` — see that file.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [{ listDistricts }, { resolveActor }] = await Promise.all([
    import('@/modules/matching/application/service-area-service'),
    import('@/shared/context/actor'),
  ])

  return respond(await listDistricts(await resolveActor(request), { companyId: 'public' }))
}
