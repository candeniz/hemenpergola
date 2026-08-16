import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/admin/settings` — every setting in the catalogue, with its range and its rationale. `POST` — change one.
 *
 * A thin adapter over the same service the server action in `app/actions/` calls, parsing
 * with the same Zod schema (`05-system-architecture.md` §Two entry points). Admin-only —
 * the service asserts it; this handler does not repeat the check, because a check repeated
 * in two places is a check that can disagree with itself.
 *
 * A change requires a `reason` and is range-checked against `modules/platform/domain/settings-catalogue.ts`. An unknown key is `NOT_FOUND`, not a silently created row: `PlatformSetting` is key-value, so a typo would otherwise sit there being read by nobody (`ADM-06`).
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [{ listSettings }, { resolveActor }] = await Promise.all([
    import('@/modules/platform/application/settings-service'),
    import('@/shared/context/actor'),
  ])

  const actor = await resolveActor(request)
  return respond(await listSettings(actor, {}))
}

export async function POST(request: Request): Promise<Response> {
  const [{ updateSetting, updateSettingSchema }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/platform/application/settings-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const parsed = updateSettingSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await updateSetting(actor, parsed.data))
}
