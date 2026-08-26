import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/me/notifications` — the in-app inbox (`13`: the row is the delivery and
 * the history; 12.2 is the first time anything could LIST it). Own rows only, newest 50.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [{ listNotifications }, { resolveActor }] = await Promise.all([
    import('@/modules/notification/application/inbox-service'),
    import('@/shared/context/actor'),
  ])

  return respond(await listNotifications(await resolveActor(request), {}))
}
