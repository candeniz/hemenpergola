import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/companies/{companyId}/offer-requests/{id}/accept` — `11` §Transition table,
 * `PENDING → ACCEPTED`, actor: manufacturer.
 *
 * The heaviest transition in the product, and none of its weight is here. Accepting is what
 * discloses the customer's contact details, so the service writes a `ContactDisclosure`
 * row, an audit entry and a `contact_disclosed` notification in the same transaction
 * (`CLAUDE.md` non-negotiable 8, `19` §Disclosure). That notification is the one entry on
 * `MANDATORY_EVENTS` and is dispatched at-least-once (`ADR-027`) — a duplicate is a
 * nuisance, a missing one is a KVKK problem.
 *
 * The three guards — inside the SLA window, `offer_request.respond`, company not suspended
 * — are the state machine's and the authorisation kind's. A client that calls this twice
 * gets a `CONFLICT` from the machine, not a second disclosure.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; offerRequestId: string }> },
): Promise<Response> {
  const [{ respondSchema, acceptOfferRequest }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/offer/application/offer-request-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId, offerRequestId } = await params
  const parsed = respondSchema.safeParse({ offerRequestId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await acceptOfferRequest(actor, parsed.data))
}
