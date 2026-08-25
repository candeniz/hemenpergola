import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/companies/{companyId}/offer-requests/{id}/offers` — send a formal offer.
 * `11` §Transition table, `ACCEPTED / SURVEY_* → OFFER_SENT`, actor: manufacturer. The same
 * call from `OFFER_SENT` is `revise`: the previous offer is superseded and both versions are
 * kept.
 *
 * **`06` split this into create (line 154) and send (line 155); the code does not, and the
 * code is right.** A created-but-unsent offer is a state `11`'s machine has no name for, and
 * a draft that can be edited after the customer has been notified is how two parties end up
 * looking at different numbers. `06` is corrected to one call.
 *
 * KDV lands once and only here (`ADR-007`): the estimate a customer saw during matching is
 * explicitly net, this is the document that carries tax. `taxRate` is optional and defaults
 * from `PlatformSetting('tax.kdv_default_percent')` — Q6's unconfirmed 20 — so the rate
 * moves without a deploy and without a client hard-coding it.
 *
 * Money is integer kuruş through the whole path (`ADR-005`).
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; offerRequestId: string }> },
): Promise<Response> {
  const [{ sendOfferSchema, sendOffer }, { resolveActor }, { err, validation }] = await Promise.all(
    [
      import('@/modules/offer/application/offer-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ],
  )

  const { companyId, offerRequestId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = sendOfferSchema.safeParse({ ...(body ?? {}), offerRequestId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await sendOffer(actor, parsed.data))
}
