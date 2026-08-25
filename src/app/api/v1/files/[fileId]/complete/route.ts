import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/files/{fileId}/complete` — the upload landed; verify it and queue the work.
 *
 * The second leg of `presign → complete → url`. The client cannot skip it: until this runs,
 * the `File` row is unscanned, and `fileUrl` will not serve an unscanned file to anybody but
 * its uploader (`storage.integration.test.ts` asserts exactly that). Image processing —
 * `IMAGE_VARIANTS`, the ladder `next/image` is configured against — is enqueued from here.
 *
 * Idempotent, because a mobile client on a flaky connection will retry it: the jobs behind
 * it are idempotent by the rule in `23` §Runtime, since a worker being replaced re-runs
 * whatever was in flight.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
): Promise<Response> {
  const [{ completeUploadSchema, completeUpload }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/media/application/file-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { fileId } = await params
  const parsed = completeUploadSchema.safeParse({ fileId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await completeUpload(await resolveActor(request), parsed.data))
}
