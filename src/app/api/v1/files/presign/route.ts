import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/files/presign` — ask for a direct-to-storage upload URL.
 *
 * **`06` had no file endpoints at all.** It takes `{ fileId }` in three request bodies —
 * project photos, company documents, portfolio items — and never said where a `fileId`
 * comes from. The `presign → complete → url` triple has existed since Phase 3 and was
 * reachable only from a server action. For a phone, which is mostly a camera, that is not a
 * gap at the edge of the API; it is a hole in the middle of it.
 *
 * The upload itself never passes through the application (Phase 3's storage decision): the
 * client PUTs the bytes at the returned URL. So the size and MIME in this request are a
 * *claim*, checked against `ownerType`'s policy before the URL is issued, and checked again
 * against what actually landed by `complete`. A client that lies here gets a `File` row that
 * never becomes usable.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [{ presignUploadSchema, presignUpload }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/media/application/file-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const parsed = presignUploadSchema.safeParse(body ?? {})
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await presignUpload(await resolveActor(request), parsed.data))
}
