import 'server-only'

import { prisma } from '@/shared/db'
import { enqueue, JOB } from '@/shared/jobs'

import { NOTIFICATION_EVENTS, type NotificationType } from '../domain/catalog'

/**
 * The ONE writer of `Notification` rows — task 7.1, `13` §Principle.
 *
 * `type` comes from the catalogue's union, so an event that is not in the closed list
 * cannot be written at all, and the catalogue test scans the source tree to keep this file
 * the only `prisma.notification.create` call site. Creating and enqueueing live together
 * so no caller can write a row that never dispatches — which is exactly what every Phase
 * 5/6 call site did before this existed.
 *
 * Callers invoke this AFTER their transaction commits (the Phase 6 rule, unchanged):
 * a rolled-back accept must not have queued a "you were accepted" mail. Subscription rows
 * (`kind: 'subscription'`) are stored but never enqueued — they are standing intent, not
 * something to send.
 *
 * `dedupeKey` gives idempotent call sites (the SLA reminders) their once-only row: when a
 * row with the same (user, type, payload path) already exists, nothing is written and
 * nothing is enqueued.
 */
export async function notify(input: {
  userId: string
  type: NotificationType
  payload: Record<string, unknown>
  /**
   * JSON paths + values inside `payload` that identify the unit of work, ANDed together —
   * the SLA reminders need (offerRequestId AND kind), because every request shares the
   * same two kinds.
   */
  dedupeOn?: readonly { path: string[]; equals: string }[]
}): Promise<{ notificationId: string | null; deduped: boolean }> {
  if (input.dedupeOn !== undefined && input.dedupeOn.length > 0) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: input.userId,
        type: input.type,
        AND: input.dedupeOn.map((condition) => ({
          payload: { path: condition.path, equals: condition.equals },
        })),
      },
      select: { id: true },
    })
    if (existing !== null) return { notificationId: existing.id, deduped: true }
  }

  const row = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      payload: JSON.parse(JSON.stringify(input.payload)) as object,
    },
  })

  if (NOTIFICATION_EVENTS[input.type].kind === 'event') {
    await enqueue(
      JOB.notificationDispatch,
      { notificationId: row.id },
      { singletonKey: `dispatch:${row.id}` },
    )
  } else {
    // A subscription is not dispatchable; stamping it keeps every future "undispatched
    // rows" query honest.
    await prisma.notification.update({
      where: { id: row.id },
      data: { dispatchedAt: row.createdAt },
    })
  }

  return { notificationId: row.id, deduped: false }
}
