import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/offer-requests/{id}/review/eligibility` (`06`, `16` §Eligibility).
 *
 * Answers three things at once — may this customer review now, why not if not, and the
 * existing review if one was already written — so a client renders the right one of form /
 * explanation / existing-review without guessing at the rules. The reason string is for
 * display; the rules stay in the service.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ offerRequestId: string }> },
): Promise<Response> {
  const [{ getReviewEligibility }, { resolveActor }] = await Promise.all([
    import('@/modules/review/application/review-service'),
    import('@/shared/context/actor'),
  ])

  const { offerRequestId } = await params
  return respond(await getReviewEligibility(await resolveActor(request), { offerRequestId }))
}
