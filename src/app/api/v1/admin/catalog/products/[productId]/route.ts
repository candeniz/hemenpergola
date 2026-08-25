import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/admin/catalog/products/{productId}` — one product as the admin editor loads
 * it: every attribute with every option, active or not (`17` §Catalogue).
 *
 * Admin-scoped where the configurator's read is anonymous, because this view includes
 * what the public one hides — deactivated options, sort orders, the machinery.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
): Promise<Response> {
  const [{ getProduct }, { resolveActor }] = await Promise.all([
    import('@/modules/catalog/application/catalog-service'),
    import('@/shared/context/actor'),
  ])

  const { productId } = await params
  return respond(await getProduct(await resolveActor(request), { productId }))
}
