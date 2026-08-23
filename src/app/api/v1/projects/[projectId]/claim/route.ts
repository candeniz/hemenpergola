import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/projects/{id}/claim` — task 4.5, `10-project-configurator.md`
 * §Anonymous drafts.
 *
 * Attaches an anonymous draft to the account that just signed in. The authorisation is the
 * **cookie**: the draft is matched by id *and* by the caller's own anonymous key, in the
 * `where` clause, so a signed-in account cannot claim a project by guessing its id. `10`
 * says *"claiming requires the cookie to still match"*; `claimProject` is where that lives
 * and `project-claim.integration.test.ts` is where it is proved.
 *
 * On this surface the key arrives as a cookie even though `/api/v1` otherwise refuses
 * cookies (`identify.ts`: no ambient credential means no CSRF). That is not a contradiction —
 * the rule is about *authentication*, and an anonymous draft key authenticates nobody. It
 * names a basket. The account half of this call still comes from the `Authorization: Bearer`
 * header or from a web session, and a request carrying only the draft cookie claims nothing
 * because `actor.userId` is null.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const [{ claimProject }, { resolveActor }] = await Promise.all([
    import('@/modules/project/application/project-service'),
    import('@/shared/context/actor'),
  ])

  const { projectId } = await params
  const actor = await resolveActor(request)
  return respond(await claimProject(actor, { projectId }))
}
