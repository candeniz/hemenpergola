import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/projects/{id}/photos` — attach an uploaded file to the project (`06`,
 * `10` §Photos).
 *
 * The `fileId` comes from §Files' `presign → complete`; this is the step that makes the
 * upload part of the project the manufacturer will eventually see. On a phone this is the
 * terrace photo — the single most likely reason a mobile customer opens the camera.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const [{ addAttachmentSchema, addAttachment }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/project/application/project-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { projectId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = addAttachmentSchema.safeParse({ ...(body ?? {}), projectId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await addAttachment(await resolveActor(request), parsed.data))
}
