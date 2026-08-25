import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/offer-requests/{id}/offer/accept` — `11` §Transition table,
 * `OFFER_SENT → OFFER_ACCEPTED`, actor: customer.
 *
 * The guard *"offer not expired"* is the state machine's, evaluated in the service against
 * the stored `validUntil` — never against a date the caller sends. That distinction is the
 * reason this route carries only an optional note: everything a client could get wrong
 * about the transition, it has no way to say.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ offerRequestId: string }> },
): Promise<Response> {
  const [{ decideOfferSchema, acceptOffer }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/offer/application/offer-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { offerRequestId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = decideOfferSchema.safeParse({ ...(body ?? {}), offerRequestId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await acceptOffer(await resolveActor(request), parsed.data))
}
