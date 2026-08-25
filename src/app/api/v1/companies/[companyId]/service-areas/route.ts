import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/companies/{companyId}/service-areas` — where this company works, and
 * `POST` — add one area (`06`, `09` §Service-area coverage, `ADR-002`/`ADR-025`).
 *
 * The kind-specific requirements (`CITY` needs a `cityId`, `RADIUS` needs a centre and a
 * 5–500 km radius) are `addServiceAreaSchema`'s refinements, so an impossible area is a
 * `VALIDATION` error here and not a row the matcher trips over later. Coverage is what
 * Phase 5's eligibility filter reads — an area added here changes who a customer is shown,
 * which is why it is `MEMBER_MANAGE`-gated in the service and not lighter.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<Response> {
  const [{ listServiceAreas }, { resolveActor }] = await Promise.all([
    import('@/modules/matching/application/service-area-service'),
    import('@/shared/context/actor'),
  ])

  const { companyId } = await params
  const actor = await resolveActor(request, { companyId })
  return respond(await listServiceAreas(actor, { companyId }))
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<Response> {
  const [{ addServiceAreaSchema, addServiceArea }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/matching/application/service-area-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = addServiceAreaSchema.safeParse({ ...(body ?? {}), companyId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await addServiceArea(actor, parsed.data))
}
