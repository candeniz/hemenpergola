import { REFERENCE_CACHE, respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/categories?locale=` — the public category tree (`06` §Catalogue).
 *
 * Anonymous and cacheable: the same data the ISR category pages render, on the same
 * freshness argument. Until Phase 10.4 this read existed only as a Server Component, which
 * is why it was easy to leave for last and wrong to leave out — it is a phone's first
 * browse screen.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [{ listPublicCategories }, { resolveActor }] = await Promise.all([
    import('@/modules/directory/application/directory-service'),
    import('@/shared/context/actor'),
  ])

  const locale = new URL(request.url).searchParams.get('locale') === 'en' ? 'en' : 'tr'
  return respond(await listPublicCategories(await resolveActor(request), { locale }), undefined, {
    cacheControl: REFERENCE_CACHE,
  })
}
