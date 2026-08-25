import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/offer-requests/{id}/offer/reject` — `11` §Transition table,
 * `OFFER_SENT → OFFER_REJECTED`, actor: customer. The reason is optional here and required
 * on the manufacturer's `decline`, which is `11`'s asymmetry and not this file's.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ offerRequestId: string }> },
): Promise<Response> {
  const [{ decideOfferSchema, rejectOffer }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/offer/application/offer-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { offerRequestId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = decideOfferSchema.safeParse({ ...(body ?? {}), offerRequestId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await rejectOffer(await resolveActor(request), parsed.data))
}
