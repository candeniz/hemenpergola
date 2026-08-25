import { REFERENCE_CACHE, respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/cities/districts` — all 974 districts, each carrying its `cityId`.
 *
 * The first version of this file defended the whole-set shape against a strawman ("per
 * keystroke") — the real alternative was one request per selected province, and it loses
 * on the numbers, which are now measured rather than guessed: the whole set is **22 KB
 * gzipped** (87 KB raw), one cacheable fetch that then answers every province change
 * offline, against a fresh round trip per selection on `29` E6's slow connection. `06`'s
 * sketched `GET /cities/{id}/districts` is corrected accordingly.
 *
 * What actually needed fixing was the missing cache: seeded reference data was shipped
 * `no-store` to every phone on every visit. Same header profile as `/cities`; same
 * `force-dynamic` note too — it keeps the handler out of the build, and the caching lives
 * in the header.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [{ listDistricts }, { resolveActor }] = await Promise.all([
    import('@/modules/matching/application/service-area-service'),
    import('@/shared/context/actor'),
  ])

  return respond(await listDistricts(await resolveActor(request), {}), undefined, {
    cacheControl: REFERENCE_CACHE,
  })
}
