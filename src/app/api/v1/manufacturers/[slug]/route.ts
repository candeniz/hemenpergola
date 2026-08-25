import { REFERENCE_CACHE, respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/manufacturers/{slug}` — one public profile: about, service cities,
 * scanned portfolio, published reviews (`06` §Public read).
 *
 * One response rather than `06`'s sketched `/portfolio` and `/reviews` sub-paths — the
 * service builds the profile whole, the web page renders it whole, and a phone showing a
 * profile screen wants exactly that. Published reviews only, scanned photos only: the
 * moderation and scan gates hold on this surface because they hold in the service.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const [{ getPublicManufacturer }, { resolveActor }] = await Promise.all([
    import('@/modules/directory/application/directory-service'),
    import('@/shared/context/actor'),
  ])

  const { slug } = await params
  return respond(await getPublicManufacturer(await resolveActor(request), { slug }), undefined, {
    cacheControl: REFERENCE_CACHE,
  })
}
