import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/offer-requests/{id}/offer` — the offer the manufacturer sent, as the
 * customer sees it (`06`, `11` §`OFFER_SENT`).
 *
 * The line items here are **not** the thing `ADR-006` hides. Two different objects share a
 * vocabulary and must not be confused: a `PriceCalculation` is the platform's internal
 * estimate, and the customer sees only its band; an `Offer` is a formal quote the
 * manufacturer wrote and sent, with KDV and a validity date, and its lines are the whole
 * point of sending it. `CustomerOfferView` is built from the second.
 *
 * Ownership is the service's `where` clause, keyed by the customer — somebody else's
 * request answers `NOT_FOUND`, not `FORBIDDEN`.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ offerRequestId: string }> },
): Promise<Response> {
  const [
    { getOffersForRequestSchema, getOffersForRequest },
    { resolveActor },
    { err, validation },
  ] = await Promise.all([
    import('@/modules/offer/application/offer-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const { offerRequestId } = await params
  const parsed = getOffersForRequestSchema.safeParse({ offerRequestId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await getOffersForRequest(await resolveActor(request), parsed.data))
}
