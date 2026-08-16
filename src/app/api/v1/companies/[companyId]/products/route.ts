import { respond } from '@/shared/http/respond'

/**
 * `GET /companies/{id}/products` — what this company offers, and `POST` — set one product's
 * offer state (task 3.2).
 *
 * The API half of the pair `05` §Two entry points asks for: the portal screen posts a server
 * action, a scripted caller posts here, and both land on the same service with the same Zod
 * schema.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<Response> {
  const [{ listCompanyProducts }, { resolveActor }] = await Promise.all([
    import('@/modules/catalog/application/company-product-service'),
    import('@/shared/context/actor'),
  ])

  const { companyId } = await params
  const actor = await resolveActor(request, { companyId })
  return respond(await listCompanyProducts(actor, { companyId }))
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<Response> {
  const [{ setCompanyProductSchema, setCompanyProduct }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/catalog/application/company-product-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = setCompanyProductSchema.safeParse({ ...(body ?? {}), companyId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await setCompanyProduct(actor, parsed.data))
}
