import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/admin/catalog/attributes/create` — a configurator field.
 *
 * A thin adapter over the same service the server action in `app/actions/` calls, parsing
 * with the same Zod schema (`05-system-architecture.md` §Two entry points). Admin-only —
 * the service asserts it; this handler does not repeat the check, because a check repeated
 * in two places is a check that can disagree with itself.
 *
 * Answers with `impact: "new-projects-only"` when the attribute is required — `10` §Admin authoring says that applies to new projects only, and the admin has to be told rather than stopped.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [{ createAttributeSchema }, { createAttribute }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/catalog/application/dto'),
      import('@/modules/catalog/application/attribute-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const body = await request.json().catch(() => null)
  const parsed = createAttributeSchema.safeParse(body)
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await createAttribute(actor, parsed.data))
}
