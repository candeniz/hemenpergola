import 'server-only'

import { prisma } from '@/shared/db'

import { transition, type OfferRequestStatus } from '../domain/state-machine'

/**
 * `offer_request.sla_expire` — `11` §SLA, task 6.6. Three moments on one queue: reminders
 * at 50% and 90% of the window, then the expiry itself.
 *
 * **Idempotent, and here is exactly how** (`23` §Runtime drains a replaced worker and
 * retries what was in flight):
 *
 *   *Reminders* dedupe on a notification row keyed by (user, type, request, kind): a
 *   re-run finds the row and writes nothing, so a drained worker cannot double-mail a
 *   manufacturer. Rows only — dispatch is Phase 7's `notification.dispatch`.
 *
 *   *Expiry* is a **transition like any other**: `FOR UPDATE`, then the machine. A re-run
 *   meets `EXPIRED` and gets the machine's `CONFLICT`, which this handler treats as "done
 *   already" — the second run of an idempotent job is not an error. A request the
 *   manufacturer answered in time meets `ACCEPTED`/`DECLINED` the same way. No direct
 *   `status` write anywhere (`CLAUDE.md` non-negotiable 4), auto-decline included.
 *
 * Notifications happen after the expiry transaction commits, first-half rule unchanged.
 *
 * ## Why the window is plain hours, not Europe/Istanbul business hours
 *
 * `11` §SLA asks for business-hours awareness and it is deliberately NOT here yet. A
 * business-hours calendar needs a Turkish public-holiday table nobody maintains in this
 * repo, and a *wrong* calendar lies worse than a plain one — an SLA that silently skips a
 * bayram the table missed penalises the manufacturer exactly the way the feature exists to
 * prevent. Q7 already plans to tune the window from real data; the 50%/90% reminders mean
 * a weekend-started clock still warns the manufacturer twice before it runs out. Recorded
 * in `25-progress.md` §Open questions as part of Q7's tuning rather than silently dropped.
 */

export type SlaOutcome =
  | { status: 'reminded'; kind: 'reminder_50' | 'reminder_90' }
  | { status: 'already-reminded' }
  | { status: 'expired' }
  | { status: 'already-settled'; requestStatus: OfferRequestStatus }
  | { status: 'not-found' }
  | { status: 'not-due' }

export async function runSlaJob(
  offerRequestId: string,
  kind: 'reminder_50' | 'reminder_90' | 'expire',
): Promise<SlaOutcome> {
  if (kind === 'expire') return runExpiry(offerRequestId)
  return runReminder(offerRequestId, kind)
}

async function runReminder(
  offerRequestId: string,
  kind: 'reminder_50' | 'reminder_90',
): Promise<SlaOutcome> {
  const request = await prisma.offerRequest.findUnique({
    where: { id: offerRequestId },
    select: { id: true, status: true, companyId: true, slaExpiresAt: true },
  })
  if (request === null) return { status: 'not-found' }

  // A reminder for a request that is no longer waiting is noise, not diligence.
  if (request.status !== 'PENDING') {
    return { status: 'already-settled', requestStatus: request.status }
  }

  const owners = await prisma.companyMembership.findMany({
    where: { companyId: request.companyId, role: 'OWNER' },
    select: { userId: true },
  })

  let wrote = false
  for (const owner of owners) {
    // The dedupe that makes a re-run silent: one reminder of each kind per owner per
    // request, however many times the job fires.
    const existing = await prisma.notification.findFirst({
      where: {
        userId: owner.userId,
        type: 'offer_request_sla_reminder',
        payload: { path: ['offerRequestId'], equals: offerRequestId },
        AND: { payload: { path: ['kind'], equals: kind } },
      },
      select: { id: true },
    })
    if (existing !== null) continue

    await prisma.notification.create({
      data: {
        userId: owner.userId,
        type: 'offer_request_sla_reminder',
        payload: { offerRequestId, kind, slaExpiresAt: request.slaExpiresAt },
      },
    })
    wrote = true
  }

  return wrote ? { status: 'reminded', kind } : { status: 'already-reminded' }
}

async function runExpiry(offerRequestId: string): Promise<SlaOutcome> {
  const outcome = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      {
        id: string
        status: OfferRequestStatus
        slaExpiresAt: Date
        customerId: string
        companyId: string
      }[]
    >`
      SELECT "id", "status", "slaExpiresAt", "customerId", "companyId"
      FROM "OfferRequest"
      WHERE "id" = ${offerRequestId}
      FOR UPDATE
    `
    const row = rows[0]
    if (row === undefined) return { kind: 'missing' as const }

    const next = transition(row.status, 'expire', {
      now: new Date(),
      actor: 'system',
      slaExpiresAt: row.slaExpiresAt,
    })
    if (!next.ok) {
      // Already EXPIRED (a retried job), or answered in time. Both are the machine saying
      // "there is nothing left to do", which for an idempotent handler is success.
      return { kind: 'settled' as const, requestStatus: row.status }
    }

    await tx.offerRequest.update({
      where: { id: row.id },
      data: { status: next.value, respondedAt: new Date() },
    })

    return { kind: 'expired' as const, customerId: row.customerId, companyId: row.companyId }
  })

  if (outcome.kind === 'missing') return { status: 'not-found' }
  if (outcome.kind === 'settled') {
    return { status: 'already-settled', requestStatus: outcome.requestStatus }
  }

  // ── after commit: both parties notified (`11` §SLA) ─────────────────────────
  const owners = await prisma.companyMembership.findMany({
    where: { companyId: outcome.companyId, role: 'OWNER' },
    select: { userId: true },
  })

  const recipients = [
    { userId: outcome.customerId, type: 'offer_request_expired' },
    ...owners.map((owner) => ({ userId: owner.userId, type: 'offer_request_expired' })),
  ]

  for (const recipient of recipients) {
    // Same dedupe as the reminders, so a crash between commit and notify cannot double a
    // row on the retry.
    const existing = await prisma.notification.findFirst({
      where: {
        userId: recipient.userId,
        type: recipient.type,
        payload: { path: ['offerRequestId'], equals: offerRequestId },
      },
      select: { id: true },
    })
    if (existing === null) {
      await prisma.notification.create({
        data: {
          userId: recipient.userId,
          type: recipient.type,
          payload: { offerRequestId },
        },
      })
    }
  }

  return { status: 'expired' }
}
