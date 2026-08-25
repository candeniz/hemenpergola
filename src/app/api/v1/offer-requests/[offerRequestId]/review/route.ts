import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/offer-requests/{id}/review` — submit the review (`06`, `16` §Content).
 *
 * Four 1–5 dimensions and a 50–2000 character body, all in `submitReviewSchema`.
 * Eligibility (from `SURVEY_COMPLETED`, `16` §Eligibility), the two-per-company-per-year
 * anti-gaming cap and moderation-before-publication are all the service's; the response is
 * the review in `PENDING`, which the client should present as "received, in moderation"
 * rather than as published — the web form learnt that distinction the hard way.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ offerRequestId: string }> },
): Promise<Response> {
  const [{ submitReviewSchema, submitReview }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/review/application/review-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { offerRequestId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = submitReviewSchema.safeParse({ ...(body ?? {}), offerRequestId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await submitReview(await resolveActor(request), parsed.data))
}
