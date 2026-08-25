import { REFERENCE_CACHE, respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/products?locale=` — the configurable products, which is *the* product list
 * (`06` §Catalogue): every product the wizard can start from, with ids and slugs.
 *
 * The ids matter: `/products/{key}` below is slug-addressed for the public page and
 * id-addressed for `/configuration`, and this list is where a client gets both keys.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [{ listConfigurableProducts }, { resolveActor }] = await Promise.all([
    import('@/modules/catalog/application/catalog-service'),
    import('@/shared/context/actor'),
  ])

  const locale = new URL(request.url).searchParams.get('locale') === 'en' ? 'en' : 'tr'
  return respond(
    await listConfigurableProducts(await resolveActor(request), { locale }),
    undefined,
    { cacheControl: REFERENCE_CACHE },
  )
}
