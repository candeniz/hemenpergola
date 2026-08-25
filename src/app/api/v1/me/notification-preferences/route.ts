import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/me/notification-preferences` — the read half of `PATCH /me`'s preference
 * write, `13` §Preferences.
 *
 * It is a separate path rather than a field on a `GET /me` body because the list is the
 * whole catalogue crossed with the channels, not a property of the account: `13`'s event
 * types are a closed union and every one of them appears here with its current state,
 * including the mandatory ones (`ADR-027`), which are returned marked rather than hidden.
 * A client that cannot see them cannot explain why a toggle is missing.
 *
 * Dynamic imports only (non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [{ listNotificationPreferences }, { resolveActor }] = await Promise.all([
    import('@/modules/notification/application/preference-service'),
    import('@/shared/context/actor'),
  ])

  return respond(await listNotificationPreferences(await resolveActor(request), {}))
}
