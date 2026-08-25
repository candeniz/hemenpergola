import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/companies/{companyId}/offer-requests` — the manufacturer's lead inbox
 * (`06`, `11`).
 *
 * This is the screen `ADR-030` says the mobile app exists for: the 48-hour SLA in `11` is a
 * promise kept or broken by somebody holding a phone between two installations, and until
 * Phase 10.2 the inbox was reachable only by a Server Component.
 *
 * **`PENDING` rows carry no contact details.** `toPendingLead` builds the DTO field by
 * field, and the reason is written in `lead-dto.ts`: an early version spread the row and
 * leaked `project.note`, which is contact data until the disclosure (`ADR-026`). Ownership
 * and the disclosure rule are the service's; this file adds nothing to either.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<Response> {
  const [{ listLeadsForCompany }, { resolveActor }] = await Promise.all([
    import('@/modules/offer/application/offer-request-service'),
    import('@/shared/context/actor'),
  ])

  const { companyId } = await params
  const actor = await resolveActor(request, { companyId })
  return respond(await listLeadsForCompany(actor, {}))
}
