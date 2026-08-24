import 'server-only'

import { prisma } from '@/shared/db'
import { notify } from '@/modules/notification/infrastructure/notify'

/**
 * The two Phase 7 events that had templates and no trigger — closed in Phase 9's last
 * code pass. Phase 7's gate proved every event RENDERS; these two lived in the gap
 * between rendering and firing, which the catalogue test now also covers (a source scan:
 * an event with no `notify()` call site cannot stay in the list).
 *
 * Both follow the SLA handler's pattern exactly: scheduled with `startAfterSeconds` at
 * the moment the deadline is created, idempotent through `notify()`'s dedupe (a drained
 * worker replays into zero new rows), state-checked at fire time (a reminder for a thing
 * that no longer needs reminding is noise, not diligence), and dispatched after this
 * handler returns — rows only, `notification.dispatch` does the sending.
 */

export type ReminderOutcome =
  | { status: 'reminded' }
  | { status: 'already-reminded' }
  | { status: 'already-settled' }
  | { status: 'window-passed' }
  | { status: 'not-found' }

/** `13` row 7 — both parties, 24 h before the survey visit. */
export async function runAppointmentReminder(appointmentId: string): Promise<ReminderOutcome> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      offerRequest: { select: { id: true, customerId: true, companyId: true } },
    },
  })
  if (appointment === null) return { status: 'not-found' }
  if (appointment.status !== 'SCHEDULED') return { status: 'already-settled' }
  if (appointment.scheduledAt.getTime() <= Date.now()) return { status: 'window-passed' }

  const owners = await prisma.companyMembership.findMany({
    where: { companyId: appointment.offerRequest.companyId, role: 'OWNER' },
    select: { userId: true },
  })

  const when = appointment.scheduledAt.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
  let wrote = false
  for (const userId of [
    appointment.offerRequest.customerId,
    ...owners.map((owner) => owner.userId),
  ]) {
    const result = await notify({
      userId,
      type: 'appointment_reminder',
      payload: { appointmentId: appointment.id, offerRequestId: appointment.offerRequest.id, when },
      dedupeOn: [{ path: ['appointmentId'], equals: appointment.id }],
    })
    if (!result.deduped) wrote = true
  }

  return wrote ? { status: 'reminded' } : { status: 'already-reminded' }
}

/** `13` row 10 — the customer (and the sender) warned 48 h before validUntil. */
export async function runOfferExpiring(offerId: string): Promise<ReminderOutcome> {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: {
      id: true,
      status: true,
      validUntil: true,
      offerRequest: {
        select: { customerId: true, companyId: true, company: { select: { displayName: true } } },
      },
    },
  })
  if (offer === null) return { status: 'not-found' }
  // Only a SENT offer can still expire on somebody: accepted/rejected/superseded ones
  // already met their decision, which for an idempotent reminder is "nothing to do".
  if (offer.status !== 'SENT') return { status: 'already-settled' }
  if (offer.validUntil.getTime() <= Date.now()) return { status: 'window-passed' }

  const owners = await prisma.companyMembership.findMany({
    where: { companyId: offer.offerRequest.companyId, role: 'OWNER' },
    select: { userId: true },
  })

  const validUntil = offer.validUntil.toLocaleDateString('tr-TR')
  let wrote = false
  for (const userId of [offer.offerRequest.customerId, ...owners.map((owner) => owner.userId)]) {
    const result = await notify({
      userId,
      type: 'offer_expiring',
      payload: {
        offerId: offer.id,
        companyName: offer.offerRequest.company.displayName,
        validUntil,
      },
      dedupeOn: [{ path: ['offerId'], equals: offer.id }],
    })
    if (!result.deduped) wrote = true
  }

  return wrote ? { status: 'reminded' } : { status: 'already-reminded' }
}
