import { respond } from '@/shared/http/respond'

/**
 * `PUT /api/v1/companies/{companyId}/products/{productId}/options` — which of a product's
 * options this company actually offers (`06`'s `offeredOptionIds`, task 3.2).
 *
 * A `PUT` of the full answer sheet, not a per-option toggle: the schema's comment says it —
 * *"Every option the company was shown, with its answer. Absent means never asked."* The
 * distinction matters to matching, where "never asked" and "answered no" filter
 * differently.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ companyId: string; productId: string }> },
): Promise<Response> {
  const [{ setCompanyOptionsSchema, setCompanyOptions }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/catalog/application/company-product-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId, productId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = setCompanyOptionsSchema.safeParse({ ...(body ?? {}), companyId, productId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await setCompanyOptions(actor, parsed.data))
}
