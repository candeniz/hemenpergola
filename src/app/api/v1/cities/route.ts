import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/cities` — `06` §Catalogue (public), the 81 provinces.
 *
 * Anonymous by decision, not by omission: the service carries
 * `why: 'public reference data … the public configurator location step reads it with no
 * session (ADR-021)'`. Phase 3 gated it behind `MEMBER_READ` and the public wizard's
 * location step then silently rendered two empty selects — the history is in the service's
 * own comment.
 *
 * **A wart travels with it, and it is reported rather than hidden.** `listCitiesSchema`
 * still requires a `companyId` that the service ignores (`void input`), left over from that
 * gating. The wizard already passes the literal `'public'`
 * (`(public-owner)/proje/[id]/page.tsx`), and this route follows the same existing
 * convention rather than inventing a second one. Removing the field is a service-signature
 * change, which is a decision for 10.4 — a public endpoint should not make an anonymous
 * client invent a company id.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [{ listCities }, { resolveActor }] = await Promise.all([
    import('@/modules/matching/application/service-area-service'),
    import('@/shared/context/actor'),
  ])

  return respond(await listCities(await resolveActor(request), { companyId: 'public' }))
}
