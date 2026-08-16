import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/admin/verification/suspend` — freeze a company, with a reason.
 *
 * A thin adapter over the same service the server action calls, parsing with the same Zod
 * schema (`05-system-architecture.md` §Two entry points). Admin-only, asserted by the
 * service.
 *
 * `02` §Verification state: read-only and hidden from search and matching, both of which follow from the status alone.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [{ suspendCompanySchema, suspendCompany }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/iam/application/verification-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const parsed = suspendCompanySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await suspendCompany(actor, parsed.data))
}
