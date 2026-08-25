import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/companies/{companyId}/offer-requests/{id}` — one lead.
 *
 * `06` line 149 states the rule this endpoint has to keep: *"contact fields present only
 * after ACCEPTED"*. It is kept in `lead-dto.ts`, which returns a discriminated union —
 * `{kind: 'pending'}` has no contact fields **to omit**, so the two shapes cannot be
 * confused by a client or by a careless spread here. Nothing in this file decides it.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string; offerRequestId: string }> },
): Promise<Response> {
  const [{ getLeadSchema, getLeadForCompany }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/offer/application/offer-request-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId, offerRequestId } = await params
  const parsed = getLeadSchema.safeParse({ offerRequestId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await getLeadForCompany(actor, parsed.data))
}
