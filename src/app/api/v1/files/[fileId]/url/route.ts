import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/files/{fileId}/url` — how to read a file.
 *
 * It returns a URL rather than bytes, and the URL's shape depends on the file's access
 * class, which lives in the storage key rather than only in a column: a portfolio photo
 * comes back as an unsigned CDN URL, a company document as a signed URL that expires in
 * five minutes. Issuing the second is a disclosure and writes an audit entry; issuing the
 * first does not, because a public photo is not a disclosure.
 *
 * That asymmetry is the service's and is covered by `storage.integration.test.ts`, which
 * asserts both halves plus the refusal to serve an unscanned file to anyone but its
 * uploader. This route adds no policy — which is the point of it existing at all rather
 * than each client reconstructing storage URLs.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
): Promise<Response> {
  const [{ fileUrlSchema, fileUrl }, { resolveActor }, { err, validation }] = await Promise.all([
    import('@/modules/media/application/file-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const { fileId } = await params
  const parsed = fileUrlSchema.safeParse({ fileId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await fileUrl(await resolveActor(request), parsed.data))
}
