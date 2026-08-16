import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/projects/{id}/validate` — task 4.7, `10-project-configurator.md` §Validation.
 *
 * Returns `{ ready, issues[] }` with **every issue carrying its step**, so the summary screen
 * links directly to the offending field. Promotes `DRAFT` → `READY` when everything passes,
 * and returns the **persisted** status — a terminal project is neither moved nor misreported.
 *
 * Only a `READY` project can request offers. The request is Phase 6; this is the gate it
 * will check.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const [{ validateProject }, { resolveActor }] = await Promise.all([
    import('@/modules/project/application/project-service'),
    import('@/shared/context/actor'),
  ])

  const { projectId } = await params
  const actor = await resolveActor(request)
  return respond(await validateProject(actor, { projectId }))
}
