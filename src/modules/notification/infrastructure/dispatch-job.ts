import 'server-only'

import { prisma } from '@/shared/db'

import {
  ALL_NOTIFICATION_TYPES,
  isMandatory,
  NOTIFICATION_EVENTS,
  type NotificationChannel,
  type NotificationType,
} from '../domain/catalog'
import { channelsFor, renderNotification } from '../domain/notification-templates'
import { getMailer } from './mailer'
import { getSmsSender } from './sms-sender'

/**
 * `notification.dispatch` — task 7.1, `13` §Delivery. The worker's third handler.
 *
 * **Idempotent by claim-then-send, and the direction of the trade is deliberate.** A
 * drained worker retries in-flight jobs (`23` §Runtime); a dispatch that ran twice is two
 * emails, and a sent email cannot be unsent. So the row is claimed — `dispatchedAt`
 * written and committed — BEFORE any channel sends. The retry of a crash-after-claim run
 * finds the stamp and sends nothing: at-most-once, where the failure mode is a rare lost
 * email (logged, visible in the row's stamp-without-mail-log gap) rather than a
 * duplicated one. The same trade the SLA handler made, sharpened because this side is
 * irreversible.
 *
 * Preferences (`13` §Preferences, `ADR-027`): in-app is the row itself and is never
 * suppressed. Email/SMS consult `NotificationPreference` — absence of a row means
 * enabled — EXCEPT for `MANDATORY_EVENTS`, which ignore preferences entirely: the
 * disclosure notice is a leg of the legal record.
 *
 * SMS goes to the `SmsSender` port, which is the log adapter until Q2→Q3 clears — the
 * production SMS path is blocked on the İYS chain, not on this code. `13`'s quiet hours
 * for SMS are deliberately deferred with the real adapter: deferral machinery for a
 * channel that only logs would be untestable theatre (recorded in `25` §Open questions
 * under the Q3 row's scope).
 */

export type DispatchOutcome =
  | { status: 'dispatched'; channels: NotificationChannel[] }
  | { status: 'already-dispatched' }
  | { status: 'subscription-skipped' }
  | { status: 'unknown-type'; type: string }
  | { status: 'not-found' }

export async function runNotificationDispatch(notificationId: string): Promise<DispatchOutcome> {
  // ── claim, atomically ───────────────────────────────────────────────────────
  const claim = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      {
        id: string
        userId: string
        type: string
        payload: unknown
        dispatchedAt: Date | null
      }[]
    >`
      SELECT "id", "userId", "type", "payload", "dispatchedAt"
      FROM "Notification"
      WHERE "id" = ${notificationId}
      FOR UPDATE
    `
    const row = rows[0]
    if (row === undefined) return { kind: 'missing' as const }
    if (row.dispatchedAt !== null) return { kind: 'claimed-before' as const }

    if (!(ALL_NOTIFICATION_TYPES as string[]).includes(row.type)) {
      // A row that predates the catalogue, or a typo notify() cannot produce. Stamp it so
      // it does not sit forever in "undispatched"; report loudly.
      await tx.notification.update({
        where: { id: row.id },
        data: { dispatchedAt: new Date() },
      })
      return { kind: 'unknown' as const, type: row.type }
    }

    const type = row.type as NotificationType
    if (NOTIFICATION_EVENTS[type].kind === 'subscription') {
      await tx.notification.update({
        where: { id: row.id },
        data: { dispatchedAt: new Date() },
      })
      return { kind: 'subscription' as const }
    }

    await tx.notification.update({ where: { id: row.id }, data: { dispatchedAt: new Date() } })

    const user = await tx.user.findUniqueOrThrow({
      where: { id: row.userId },
      select: { email: true, phone: true, locale: true },
    })

    return {
      kind: 'claimed' as const,
      type,
      payload: (row.payload ?? {}) as Record<string, string | number>,
      userId: row.userId,
      user,
    }
  })

  if (claim.kind === 'missing') return { status: 'not-found' }
  if (claim.kind === 'claimed-before') return { status: 'already-dispatched' }
  if (claim.kind === 'unknown') return { status: 'unknown-type', type: claim.type }
  if (claim.kind === 'subscription') return { status: 'subscription-skipped' }

  // ── send, after the claim committed ─────────────────────────────────────────
  const rendered = renderNotification(
    claim.type,
    claim.user.locale === 'en' ? 'en' : 'tr',
    claim.payload,
  )
  if (rendered === null) return { status: 'subscription-skipped' }

  const granted = channelsFor(claim.type)
  const sent: NotificationChannel[] = ['in_app'] // the row itself is the in-app delivery

  const wants = async (channel: 'email' | 'sms'): Promise<boolean> => {
    if (isMandatory(claim.type)) return true
    const preference = await prisma.notificationPreference.findUnique({
      where: { userId_channel_type: { userId: claim.userId, channel, type: claim.type } },
      select: { enabled: true },
    })
    return preference?.enabled ?? true
  }

  if (granted.includes('email') && (await wants('email'))) {
    await getMailer().send({
      to: claim.user.email,
      subject: rendered.title,
      text: rendered.body,
    })
    sent.push('email')
  }

  if (granted.includes('sms') && rendered.sms !== undefined && claim.user.phone !== null) {
    if (await wants('sms')) {
      await getSmsSender().send({ to: claim.user.phone, text: rendered.sms })
      sent.push('sms')
    }
  }

  return { status: 'dispatched', channels: sent }
}
