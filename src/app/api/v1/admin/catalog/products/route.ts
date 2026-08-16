import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/admin/catalog/products` — products, optionally within one category.
 *
 * A thin adapter over the same service the server action in `app/actions/` calls, parsing
 * with the same Zod schema (`05-system-architecture.md` §Two entry points). Admin-only —
 * the service asserts it; this handler does not repeat the check, because a check repeated
 * in two places is a check that can disagree with itself.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [{ listProductsSchema }, { listProducts }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/catalog/application/dto'),
      import('@/modules/catalog/application/catalog-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const url = new URL(request.url)
  const parsed = listProductsSchema.safeParse({
    categoryId: url.searchParams.get('categoryId') ?? undefined,
    includeInactive: url.searchParams.get('includeInactive') === 'true',
  })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await listProducts(actor, parsed.data))
}
