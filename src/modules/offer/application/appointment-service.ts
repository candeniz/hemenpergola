import 'server-only'

import { z } from 'zod'

import { authorize } from '@/modules/iam/application/authorization'
import { PERMISSIONS } from '@/modules/iam/domain/permissions'
import { prisma } from '@/shared/db'
import { notify } from '@/modules/notification/infrastructure/notify'
import { err, notFound, ok } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

import { transition, type OfferRequestStatus } from '../domain/state-machine'

/**
 * Appointments — task 6.7 (`manufacturer_project_calendar`,
 * `manufacturer_appointment_detail`). Thin on purpose: the interesting rules live in the
 * machine (`schedule` needs a future date, `complete` needs the visit to have happened),
 * and completion is what makes the engagement review-eligible — `16` reads
 * `SURVEY_COMPLETED`, which only these transitions can produce.
 */

export const scheduleAppointmentSchema = z.object({
  offerRequestId: z.string().min(1),
  scheduledAt: z.coerce.date(),
  durationMin: z.number().int().min(15).max(480).default(60),
  note: z.string().trim().max(500).optional(),
})
export type ScheduleAppointmentInput = z.infer<typeof scheduleAppointmentSchema>

export const completeAppointmentSchema = z.object({ offerRequestId: z.string().min(1) })
export type CompleteAppointmentInput = z.infer<typeof completeAppointmentSchema>

export const scheduleAppointment = serviceMethod<
  ScheduleAppointmentInput,
  { appointmentId: string; status: OfferRequestStatus }
>(
  'offer',
  'scheduleAppointment',
  { kind: 'permission', permission: PERMISSIONS.OFFER_REQUEST_RESPOND },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.OFFER_REQUEST_RESPOND)
    if (!allowed.ok) return err(allowed.error)
    if (actor.companyId === null) return err(notFound('OfferRequest'))

    const outcome = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; status: OfferRequestStatus; slaExpiresAt: Date; customerId: string }[]
      >`
        SELECT "id", "status", "slaExpiresAt", "customerId"
        FROM "OfferRequest"
        WHERE "id" = ${input.offerRequestId} AND "companyId" = ${actor.companyId}
        FOR UPDATE
      `
      const row = rows[0]
      if (row === undefined) return { kind: 'error' as const, error: notFound('OfferRequest') }

      // ACCEPTED → schedule, or SURVEY_SCHEDULED → reschedule; the machine knows which.
      const event =
        row.status === 'SURVEY_SCHEDULED' ? ('reschedule' as const) : ('schedule' as const)
      const next = transition(row.status, event, {
        now: new Date(),
        actor: 'manufacturer',
        slaExpiresAt: row.slaExpiresAt,
        scheduledAt: input.scheduledAt,
      })
      if (!next.ok) return { kind: 'error' as const, error: next.error }

      if (event === 'reschedule') {
        await tx.appointment.updateMany({
          where: { offerRequestId: row.id, status: 'SCHEDULED' },
          data: { status: 'CANCELLED' },
        })
      }

      const appointment = await tx.appointment.create({
        data: {
          offerRequestId: row.id,
          scheduledAt: input.scheduledAt,
          durationMin: input.durationMin,
          note: input.note ?? null,
        },
      })

      await tx.offerRequest.update({ where: { id: row.id }, data: { status: next.value } })

      return {
        kind: 'scheduled' as const,
        appointmentId: appointment.id,
        status: next.value,
        customerId: row.customerId,
      }
    })

    if (outcome.kind === 'error') return err(outcome.error)

    // After commit — `11` §Transition table's "both notified".
    await notify({
      userId: outcome.customerId,
      type: 'survey_scheduled',
      payload: {
        offerRequestId: input.offerRequestId,
        when: input.scheduledAt.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
      },
    })

    return ok({ appointmentId: outcome.appointmentId, status: outcome.status })
  },
)

export const completeAppointment = serviceMethod<
  CompleteAppointmentInput,
  { status: OfferRequestStatus }
>(
  'offer',
  'completeAppointment',
  { kind: 'permission', permission: PERMISSIONS.OFFER_REQUEST_RESPOND },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.OFFER_REQUEST_RESPOND)
    if (!allowed.ok) return err(allowed.error)
    if (actor.companyId === null) return err(notFound('OfferRequest'))

    const outcome = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; status: OfferRequestStatus; slaExpiresAt: Date }[]
      >`
        SELECT "id", "status", "slaExpiresAt"
        FROM "OfferRequest"
        WHERE "id" = ${input.offerRequestId} AND "companyId" = ${actor.companyId}
        FOR UPDATE
      `
      const row = rows[0]
      if (row === undefined) return { kind: 'error' as const, error: notFound('OfferRequest') }

      const appointment = await tx.appointment.findFirst({
        where: { offerRequestId: row.id, status: 'SCHEDULED' },
        orderBy: { scheduledAt: 'desc' },
      })

      const next = transition(row.status, 'complete', {
        now: new Date(),
        actor: 'manufacturer',
        slaExpiresAt: row.slaExpiresAt,
        appointmentScheduledAt: appointment?.scheduledAt ?? null,
      })
      if (!next.ok) return { kind: 'error' as const, error: next.error }

      await tx.appointment.update({
        where: { id: appointment!.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })
      await tx.offerRequest.update({ where: { id: row.id }, data: { status: next.value } })

      return { kind: 'completed' as const, status: next.value }
    })

    if (outcome.kind === 'error') return err(outcome.error)
    return ok({ status: outcome.status })
  },
)

export const appointmentService = {
  scheduleAppointment,
  completeAppointment,
} satisfies Record<string, { meta: unknown }>
