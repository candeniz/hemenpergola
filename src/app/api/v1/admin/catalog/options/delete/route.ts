import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/admin/catalog/options/delete` — **refused the moment anything references it.**
 *
 * A thin adapter over the same service the server action in `app/actions/` calls, parsing
 * with the same Zod schema (`05-system-architecture.md` §Two entry points). Admin-only —
 * the service asserts it; this handler does not repeat the check, because a check repeated
 * in two places is a check that can disagree with itself.
 *
 * `10` §Admin authoring: *"Never delete a `ProductOption` that has been referenced. Deactivate."* A `PriceCalculation.breakdown` from six months ago still names it.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [{ deleteOptionSchema }, { deleteOption }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/catalog/application/dto'),
      import('@/modules/catalog/application/attribute-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const body = await request.json().catch(() => null)
  const parsed = deleteOptionSchema.safeParse(body)
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await deleteOption(actor, parsed.data))
}
