import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/projects` — start a draft (task 4.1).
 *
 * The API half of the pair `05` §Two entry points asks for: the wizard posts a server action,
 * a scripted caller posts here, and both land on the same service with the same Zod schema.
 *
 * No permission is checked because a project has none — `02` §Customer permissions makes
 * authorisation ownership plus state, and the row is stamped with the caller's own identity.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [{ createProjectSchema, createProject }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/project/application/project-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const parsed = createProjectSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await createProject(actor, parsed.data))
}
