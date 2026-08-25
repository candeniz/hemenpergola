import { REFERENCE_CACHE, respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/products/{slug}?locale=` — the public product page's data
 * (`06` §Catalogue, `07` §Route map's `/urunler/[slug]`).
 *
 * Slug-addressed, with the directory's moved-slug handling — a `moved` answer names the
 * new slug rather than 404ing an old stored link. The sibling `/configuration` is
 * **id**-addressed; the segment is called `key` because it means one or the other by
 * sub-resource, and the products list carries both keys.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  const [{ getPublicProduct }, { resolveActor }] = await Promise.all([
    import('@/modules/directory/application/directory-service'),
    import('@/shared/context/actor'),
  ])

  const { key } = await params
  const locale = new URL(request.url).searchParams.get('locale') === 'en' ? 'en' : 'tr'

  return respond(
    await getPublicProduct(await resolveActor(request), { slug: key, locale }),
    undefined,
    { cacheControl: REFERENCE_CACHE },
  )
}
