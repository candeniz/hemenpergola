import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/admin/offer-requests/{id}/close` — move a stuck request to `CLOSED`.
 *
 * The reason is required by `closeOfferRequestSchema`, and it is required because this is
 * the only transition a person can make on somebody else's engagement. `17` §Audit log
 * keeps the row; an unexplained terminal state on a customer's request would be
 * indistinguishable from a bug months later.
 *
 * It goes through the state machine like everything else (`CLAUDE.md` non-negotiable 4) —
 * `CLOSED` is a transition, not a `status` write with better manners.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ offerRequestId: string }> },
): Promise<Response> {
  const [{ closeOfferRequestSchema, closeOfferRequest }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/offer/application/offer-request-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { offerRequestId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = closeOfferRequestSchema.safeParse({ ...(body ?? {}), offerRequestId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await closeOfferRequest(await resolveActor(request), parsed.data))
}
