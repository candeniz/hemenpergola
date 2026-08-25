import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/companies/{companyId}/portfolio/{itemId}/photos` — attach an uploaded file
 * to a portfolio item (`06`, `14`).
 *
 * The `fileId` comes from §Files' `presign → complete` pair; this is the third step for
 * portfolio work, and the one where the photo becomes public-facing intent. It still is
 * not public-visible until the scan clears — `fileUrl`'s rule, not this route's.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; itemId: string }> },
): Promise<Response> {
  const [{ attachPhotoSchema, attachPhoto }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/portfolio/application/portfolio-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId, itemId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = attachPhotoSchema.safeParse({ ...(body ?? {}), companyId, itemId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await attachPhoto(actor, parsed.data))
}
