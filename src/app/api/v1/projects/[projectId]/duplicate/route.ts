import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/projects/{id}/duplicate` — a new draft with the same answers (`06`, `10`).
 *
 * The second-pergola path: a customer who just finished one configuration starts the next
 * from it instead of from a blank wizard. The copy is a DRAFT regardless of the source's
 * status — duplicating a submitted project must not duplicate its submissions.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const [{ duplicateProject }, { resolveActor }] = await Promise.all([
    import('@/modules/project/application/project-service'),
    import('@/shared/context/actor'),
  ])

  const { projectId } = await params
  return respond(await duplicateProject(await resolveActor(request), { projectId }))
}
