import 'server-only'

import { prisma } from '@/shared/db'
import { err, notFound, ok } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

import { ALL_NOTIFICATION_TYPES, type NotificationType } from '../domain/catalog'

// The contract lives in ./dto (CLAUDE.md §Conventions).
export * from './dto'

import type { ListNotificationsInput, NotificationListItem } from './dto'

/**
 * The in-app inbox — `13` calls the `Notification` row *"the in-app delivery and the
 * user's history"*, the dispatcher has written those rows since Phase 7, and until 12.2
 * no capability listed them anywhere, web or mobile. `api-surface` could not see the hole:
 * it counts REGISTERED methods, and a capability that was never registered is not a
 * drifted adapter, it is an unbuilt feature.
 *
 * **No mark-as-read here, deliberately.** The `readAt` column exists for `13`'s message
 * digest fold ("further messages in the same thread within 15 minutes"), and `13` defines
 * no user-facing read interaction — building one would be a feature the doc never asked
 * for, decided in a service file. If the product wants it, that is a `13` change first.
 *
 * The newest 50: the history's job is "what happened lately", and `13`'s 90-day retention
 * sweep bounds the table — pagination can arrive with a screen that needs it.
 *
 * **A type the catalogue no longer knows is excluded, and it is excluded in the QUERY**
 * (task 14.8). Two separate points, and the second one is the bug.
 *
 * *Why exclude.* Renaming an event is a pure code change — templates live in the repository,
 * not the database (`13`) — with no migration for rows already written, and `ADR-027` keeps
 * mandatory events out of the ninety-day sweep, so orphaned rows stay indefinitely and are
 * the NEWEST things in the list on the day of the rename. Both surfaces render the row as
 * `privacy.events.${type}`, so showing one means a raw message key on screen, and on mobile a
 * row whose tap derives its destination from the type and therefore goes nowhere. The subject
 * loses nothing: 14.7 put exactly these rows in the KVKK export, with their type and their
 * dates, and that is where the completeness obligation lives. `13` §Inbox carries the
 * argument for why the two surfaces answer differently — the export is the record, this is a
 * reading list.
 *
 * *Why in the query.* The filter used to run in JavaScript, after `take: 50`. The quota was
 * therefore spent on rows that were discarded a line later: twelve orphans cost the reader
 * twelve real notifications, and fifty cost them the entire screen — an inbox reporting
 * "empty" with readable rows sitting directly underneath. `where` makes the take mean fifty
 * readable rows, which is what the number was always supposed to promise.
 *
 * It also makes the cast below true by construction rather than by a hand-written guard
 * repeated per call site — the shape Q39 wants everywhere.
 */
export const listNotifications = serviceMethod<
  ListNotificationsInput,
  { notifications: NotificationListItem[] }
>(
  'notification',
  'listNotifications',
  {
    kind: 'owner',
    describe: 'the caller’s own Notification rows; userId is the whole of the where clause',
  },
  async (actor) => {
    if (actor.userId === null) return err(notFound('Notification'))

    const rows = await prisma.notification.findMany({
      where: { userId: actor.userId, type: { in: ALL_NOTIFICATION_TYPES as string[] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
    })

    return ok({
      notifications: rows.map((row) => ({
        id: row.id,
        type: row.type as NotificationType,
        payload: (row.payload ?? {}) as Record<string, unknown>,
        readAt: row.readAt,
        createdAt: row.createdAt,
      })),
    })
  },
)
