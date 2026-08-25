import { respond } from '@/shared/http/respond'

/**
 * `DELETE /api/v1/projects/{id}/photos/{attachmentId}` (`06`, `10` §Photos).
 *
 * Detaches from the project; the stored object's own lifecycle is the retention sweep's
 * business, not this request's — a photo that two drafts referenced must not vanish from
 * the other one.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string; attachmentId: string }> },
): Promise<Response> {
  const [{ removeAttachmentSchema, removeAttachment }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/project/application/project-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { projectId, attachmentId } = await params
  const parsed = removeAttachmentSchema.safeParse({ projectId, attachmentId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await removeAttachment(await resolveActor(request), parsed.data))
}
