import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/companies/{companyId}/offer-requests/{id}/outcome` — the commercial result.
 * `11` §Transition table: `OFFER_ACCEPTED → WON`, and `OFFER_REJECTED / OFFER_ACCEPTED →
 * LOST`. Actor: manufacturer.
 *
 * One endpoint with a `result` discriminator, as `06` line 156 specifies, dispatching to
 * `markWon` or `markLost`. The two are separate service methods because their guards
 * differ — `11` requires a reason for `LOST` and none for `WON` — and that asymmetry is
 * enforced by `markOutcomeSchema` plus the machine, not by a branch here deciding what is
 * acceptable.
 *
 * `WON` is the row Phase 7's analytics reads, and `09`'s Bayesian component reads what that
 * produces. An outcome recorded late is a ranking that is wrong quietly, which is why this
 * belongs on the phone rather than on a desk somebody returns to on Friday.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; offerRequestId: string }> },
): Promise<Response> {
  const [{ markOutcomeSchema, markWon, markLost }, { resolveActor }, { err, validation }, { z }] =
    await Promise.all([
      import('@/modules/offer/application/offer-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
      import('zod'),
    ])

  const { companyId, offerRequestId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  // The discriminator is transport-level routing, not a domain rule: it selects which
  // service method is called and has no other effect. Both branches then parse with the
  // service's own schema.
  const routed = z.object({ result: z.enum(['WON', 'LOST']) }).safeParse(body ?? {})
  if (!routed.success) return respond(err(validation(routed.error.issues)))

  const parsed = markOutcomeSchema.safeParse({ ...(body ?? {}), offerRequestId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  const mark = routed.data.result === 'WON' ? markWon : markLost
  return respond(await mark(actor, parsed.data))
}
