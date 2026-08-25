import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/admin/offer-requests` — the requests an admin may close.
 *
 * `11` §Transition table ends with the one power an operator has: *"There is no admin
 * override that skips a guard; an admin can `CLOSED` a stuck request, with a reason, and
 * that is all"*. This lists the candidates for that, and nothing else — it is not a general
 * admin view over every request, because a general view is how an override gets added later
 * without anyone deciding to add one.
 *
 * Admin-only, asserted by the service (`kind: 'admin'`).
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [{ listClosableRequests }, { resolveActor }] = await Promise.all([
    import('@/modules/offer/application/offer-request-service'),
    import('@/shared/context/actor'),
  ])

  return respond(await listClosableRequests(await resolveActor(request), {}))
}
