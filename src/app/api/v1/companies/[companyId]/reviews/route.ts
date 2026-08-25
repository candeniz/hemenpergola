import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/companies/{companyId}/reviews` — the company's published reviews, as the
 * company sees them (`06`, `16` §Manufacturer response).
 *
 * Published only: an unmoderated review is invisible to the company too, not just to the
 * public — a manufacturer who could read a `PENDING` review could pressure its author
 * before moderation ever saw it. What the company gets beyond the public view is not more
 * reviews but the ability to respond, which is the sibling route.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<Response> {
  const [{ listPublishedReviewsAsCompany }, { resolveActor }] = await Promise.all([
    import('@/modules/review/application/review-service'),
    import('@/shared/context/actor'),
  ])

  const { companyId } = await params
  const actor = await resolveActor(request, { companyId })
  return respond(await listPublishedReviewsAsCompany(actor, {}))
}
