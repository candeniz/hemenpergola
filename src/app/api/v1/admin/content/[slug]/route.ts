import { respond } from '@/shared/http/respond'

/**
 * `PUT /api/v1/admin/content/{slug}` — write a CMS page (`06` §Admin, `18` §Content).
 *
 * Off `api-surface`'s web-only list, deliberately: the first version of that list exempted
 * this as "wide-screen work", and the reason did not survive comparison with admin
 * catalogue, settings and verification — equally wide-screen, all with full `/api/v1`
 * trees. The admin block editor is where a person writes; the endpoint is what scripts,
 * migrations and the next tool call. `key` is a closed enum, so an unknown slug is a 422,
 * not a new page — the CMS has a fixed page set by design.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const [{ upsertContentPageSchema, upsertContentPage }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/content/application/content-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { slug } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = upsertContentPageSchema.safeParse({ ...(body ?? {}), key: slug })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await upsertContentPage(await resolveActor(request), parsed.data))
}
