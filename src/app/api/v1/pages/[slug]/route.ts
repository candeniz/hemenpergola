import { REFERENCE_CACHE, respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/pages/{slug}?locale=` — a CMS page's blocks (`06` §Public read, `18`
 * §Content).
 *
 * The blocks come back as structured data, not rendered HTML: the client renders them
 * with its own components, which is what keeps the 8.3 sanitisation story one-sided —
 * the API never ships markup a client is expected to inject.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const [{ getPublicContentPage }, { resolveActor }] = await Promise.all([
    import('@/modules/content/application/content-service'),
    import('@/shared/context/actor'),
  ])

  const { slug } = await params
  const locale = new URL(request.url).searchParams.get('locale') === 'en' ? 'en' : 'tr'

  return respond(
    await getPublicContentPage(await resolveActor(request), { key: slug, locale }),
    undefined,
    { cacheControl: REFERENCE_CACHE },
  )
}
