import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/companies/{companyId}/estimate` — price a project shape against this
 * company's PUBLISHED book (`08`).
 *
 * Not the simulator: the simulator prices drafts against a chosen book version and writes
 * nothing; this resolves the published book itself and **persists** a `PriceCalculation`
 * with actor and IP — `ADR-006` §Anti-scraping's rule that every estimate a person sees is
 * a row somebody can be asked about. The IP comes from the resolved actor, never from the
 * body; the schema has no field for it.
 *
 * The last of `api-surface`'s no-surface inventory: built in Phase 3 for the compare
 * screen, integration-tested, and reachable from nothing until now.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<Response> {
  const [{ estimateForProjectSchema, estimateForProject }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/pricing/application/simulate-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = estimateForProjectSchema.safeParse({ ...(body ?? {}), companyId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await estimateForProject(actor, { ...parsed.data, requestIp: actor.ip }))
}
