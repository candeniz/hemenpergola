import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/admin/verification/[companyId]` — profile, documents, members and history.
 *
 * A thin adapter over the same service the server action calls, parsing with the same Zod
 * schema (`05-system-architecture.md` §Two entry points). Admin-only, asserted by the
 * service.
 *
 * The history is read from `AuditLog` rather than a second table, so the detail screen and the audit viewer cannot tell different stories.
 */
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ companyId: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const [{ getCompanyForVerification }, { resolveActor }] = await Promise.all([
    import('@/modules/iam/application/verification-service'),
    import('@/shared/context/actor'),
  ])

  const { companyId } = await context.params
  const actor = await resolveActor(request)
  return respond(await getCompanyForVerification(actor, { companyId }))
}
