import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/companies/{companyId}/offer-requests/{id}/decline` — `11` §Transition
 * table, `PENDING → DECLINED`, actor: manufacturer.
 *
 * *"reason required"* is `11`'s guard and `declineSchema` is where it lives, so a client
 * that omits it gets a `VALIDATION` error rather than an anonymous refusal appearing in the
 * customer's timeline. Declining never discloses contact details — the disclosure is bound
 * to acceptance and to nothing else.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; offerRequestId: string }> },
): Promise<Response> {
  const [{ declineSchema, declineOfferRequest }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/offer/application/offer-request-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId, offerRequestId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = declineSchema.safeParse({ ...(body ?? {}), offerRequestId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await declineOfferRequest(actor, parsed.data))
}
