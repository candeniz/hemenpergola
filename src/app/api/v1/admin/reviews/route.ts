import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/admin/reviews` — the moderation queue (`06` §Admin, `16` §Moderation).
 *
 * `PENDING` reviews, which nobody else can see — not the public, not the company, not even
 * this list's own aggregates. Admin-only, asserted by the service; every moderation
 * decision writes an `AuditLog` row per `06` §Admin's blanket rule.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [{ listPendingReviews }, { resolveActor }] = await Promise.all([
    import('@/modules/review/application/review-service'),
    import('@/shared/context/actor'),
  ])

  return respond(await listPendingReviews(await resolveActor(request), {}))
}
