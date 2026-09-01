import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/companies/{companyId}/dashboard` — the portal dashboard's summary
 * (task 13.8, `06`).
 *
 * The same leads `/offer-requests` returns, counted. It is a separate endpoint rather than a
 * flag on that one because the shapes are different questions: the inbox is a list a person
 * works through, this is an arrangement of totals. A client wanting both asks twice, which
 * is cheap — the underlying query is the same and the summary is arithmetic.
 *
 * Ownership and the no-contact-data rule are the service's (`ADR-006`, `19` §Disclosure);
 * this file adds nothing to either.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<Response> {
  const [{ getPortalDashboard }, { resolveActor }] = await Promise.all([
    import('@/modules/offer/application/offer-request-service'),
    import('@/shared/context/actor'),
  ])

  const { companyId } = await params
  const actor = await resolveActor(request, { companyId })
  return respond(await getPortalDashboard(actor, {}))
}
