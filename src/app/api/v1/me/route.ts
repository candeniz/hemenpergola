import { respond } from '@/shared/http/respond'

/**
 * `PATCH /api/v1/me` — notification preferences, as `06` §Auth specifies them
 * (*"profile, locale, notification preferences"*).
 *
 * Only the preference half exists so far, and that is deliberate rather than partial: the
 * preference service is what had no surface at all. Profile and locale writes are reachable
 * today through the account forms and land in Phase 10.4 with the rest of `iam`.
 *
 * One preference per call — `setNotificationPreferenceSchema` is `{channel, type, enabled}`
 * — because that is the shape a toggle produces and the shape `13` §Preferences stores. The
 * mandatory events (`ADR-027`) reject the write in the service, not here: a closed list
 * enforced at one entry point is a list the other entry point can walk around.
 *
 * Dynamic imports only (non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function PATCH(request: Request): Promise<Response> {
  const [
    { setNotificationPreferenceSchema, setNotificationPreference },
    { resolveActor },
    { err, validation },
  ] = await Promise.all([
    import('@/modules/notification/application/preference-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const parsed = setNotificationPreferenceSchema.safeParse(body ?? {})
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await setNotificationPreference(await resolveActor(request), parsed.data))
}
