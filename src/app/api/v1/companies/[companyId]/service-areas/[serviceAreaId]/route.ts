import { respond } from '@/shared/http/respond'

/**
 * `DELETE /api/v1/companies/{companyId}/service-areas/{id}` (`06`).
 *
 * Removal narrows matching immediately — the eligibility filter reads live rows — so this
 * is deliberately a hard delete of the row and not a soft flag: an area a company no
 * longer serves must not be an area a customer is still matched into.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ companyId: string; serviceAreaId: string }> },
): Promise<Response> {
  const [{ removeServiceAreaSchema, removeServiceArea }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/matching/application/service-area-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId, serviceAreaId } = await params
  const parsed = removeServiceAreaSchema.safeParse({ companyId, serviceAreaId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await removeServiceArea(actor, parsed.data))
}
