import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/admin/verification/verify` — approve a company.
 *
 * A thin adapter over the same service the server action calls, parsing with the same Zod
 * schema (`05-system-architecture.md` §Two entry points). Admin-only, asserted by the
 * service.
 *
 * Sets `verifiedAt` and unlocks matching, which reads `status = VERIFIED` — there is no second switch to forget.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [{ verifyCompanySchema, verifyCompany }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/iam/application/verification-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const parsed = verifyCompanySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await verifyCompany(actor, parsed.data))
}
