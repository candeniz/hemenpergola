import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/admin/reviews/{id}/moderate` — publish or reject (`06` §Admin, `16`
 * §Moderation).
 *
 * `moderateReviewSchema`'s refinement requires a reason for `REJECTED`, because `16`
 * notifies the author with it — an unexplained rejection is a review the author rewrites
 * identically. Publishing recomputes the company aggregates in the service, the same
 * recompute the equality test locks.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reviewId: string }> },
): Promise<Response> {
  const [{ moderateReviewSchema, moderateReview }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/review/application/review-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { reviewId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = moderateReviewSchema.safeParse({ ...(body ?? {}), reviewId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await moderateReview(await resolveActor(request), parsed.data))
}
