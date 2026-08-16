import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/admin/catalog/categories/create` — a new category.
 *
 * A thin adapter over the same service the server action in `app/actions/` calls, parsing
 * with the same Zod schema (`05-system-architecture.md` §Two entry points). Admin-only —
 * the service asserts it; this handler does not repeat the check, because a check repeated
 * in two places is a check that can disagree with itself.
 *
 * Both locales are required: `07` §Route map gives `en` its own slug set, so a category without an English translation has no English URL to fall back to (`ADR-017`).
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [{ createCategorySchema }, { createCategory }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/catalog/application/dto'),
      import('@/modules/catalog/application/catalog-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const body = await request.json().catch(() => null)
  const parsed = createCategorySchema.safeParse(body)
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await createCategory(actor, parsed.data))
}
