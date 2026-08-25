import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/companies/{companyId}/reviews/{reviewId}/response` — the manufacturer's
 * one public reply (`06`, `16` §Manufacturer response).
 *
 * One response per review and no editing after publication — `16`'s rules, enforced in the
 * service. The response is public the moment it lands, so the service also notifies the
 * review's author (`review_responded` in `13`'s catalogue).
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; reviewId: string }> },
): Promise<Response> {
  const [{ respondToReviewSchema, respondToReview }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/review/application/review-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId, reviewId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = respondToReviewSchema.safeParse({ ...(body ?? {}), reviewId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await respondToReview(actor, parsed.data))
}
