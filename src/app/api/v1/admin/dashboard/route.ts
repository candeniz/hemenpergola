import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/admin/dashboard` — the operator's counts (`17` §Dashboard).
 *
 * Live counts, deliberately uncached: the whole point of the numbers is "what needs me
 * right now" — pending verifications, pending reviews, stuck requests.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [{ dashboardCounts }, { resolveActor }] = await Promise.all([
    import('@/modules/platform/application/settings-service'),
    import('@/shared/context/actor'),
  ])

  return respond(await dashboardCounts(await resolveActor(request), {}))
}
