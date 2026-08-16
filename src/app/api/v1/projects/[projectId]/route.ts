import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/projects/{id}` — read one project, and
 * `PATCH` — write one step (tasks 4.2 to 4.4).
 *
 * `10` §Step structure specifies `PATCH /projects/{id}` per step, so the step name travels in
 * the body rather than the path: it is *what is being written*, not *what is being addressed*.
 *
 * Ownership is the whole of the authorisation, enforced in the service's `where` clause — a
 * project belonging to somebody else answers `NOT_FOUND` rather than `FORBIDDEN`.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const [{ getProject }, { resolveActor }] = await Promise.all([
    import('@/modules/project/application/project-service'),
    import('@/shared/context/actor'),
  ])

  const { projectId } = await params
  const actor = await resolveActor(request)
  return respond(await getProject(actor, { projectId }))
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const [{ patchStepSchema, patchStep }, { resolveActor }, { err, validation }] = await Promise.all(
    [
      import('@/modules/project/application/project-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ],
  )

  const { projectId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  // The id comes from the path, so a request cannot address one project and name another.
  const parsed = patchStepSchema.safeParse({ ...(body ?? {}), projectId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await patchStep(actor, parsed.data))
}
