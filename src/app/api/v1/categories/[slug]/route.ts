import { REFERENCE_CACHE, respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/categories/{slug}?locale=` — one category page's data (`06` §Catalogue).
 *
 * Slug-addressed like its web page; a renamed category answers through the same
 * moved-slug handling the page uses, so old links a client stored keep resolving.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const [{ getPublicCategory }, { resolveActor }] = await Promise.all([
    import('@/modules/directory/application/directory-service'),
    import('@/shared/context/actor'),
  ])

  const { slug } = await params
  const locale = new URL(request.url).searchParams.get('locale') === 'en' ? 'en' : 'tr'

  return respond(
    await getPublicCategory(await resolveActor(request), { slug, locale }),
    undefined,
    { cacheControl: REFERENCE_CACHE },
  )
}
