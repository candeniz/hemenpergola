import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/admin/catalog/categories/delete` — refused if it has children or products.
 *
 * A thin adapter over the same service the server action in `app/actions/` calls, parsing
 * with the same Zod schema (`05-system-architecture.md` §Two entry points). Admin-only —
 * the service asserts it; this handler does not repeat the check, because a check repeated
 * in two places is a check that can disagree with itself.
 *
 * `17` §Catalogue: deactivate instead. A deleted category takes an indexed public URL with it.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [{ deleteCategorySchema }, { deleteCategory }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/catalog/application/dto'),
      import('@/modules/catalog/application/catalog-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const body = await request.json().catch(() => null)
  const parsed = deleteCategorySchema.safeParse(body)
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await deleteCategory(actor, parsed.data))
}
