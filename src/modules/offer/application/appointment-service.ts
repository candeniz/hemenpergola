import 'server-only'

import {} from 'zod'

import { authorize } from '@/modules/iam/application/authorization'
import { PERMISSIONS } from '@/modules/iam/domain/permissions'
import { prisma } from '@/shared/db'
import { notify } from '@/modules/notification/infrastructure/notify'
import { enqueue, JOB } from '@/shared/jobs'
import { err, notFound, ok } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

import { dayKey, gridRange, type CalendarEvent } from '../domain/calendar'
import { transition, type OfferRequestStatus } from '../domain/state-machine'

/**
 * Appointments — task 6.7 (`manufacturer_project_calendar`,
 * `manufacturer_appointment_detail`). Thin on purpose: the interesting rules live in the
 * machine (`schedule` needs a future date, `complete` needs the visit to have happened),
 * and completion is what makes the engagement review-eligible — `16` reads
 * `SURVEY_COMPLETED`, which only these transitions can produce.
 */

// The contract lives in ./dto (extracted in 11.2).
export * from './dto'

import {
  type CompleteAppointmentInput,
  type ListCalendarInput,
  type ScheduleAppointmentInput,
} from './dto'

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

    // 13 row 7: both parties reminded 24 h before the visit. Scheduled now, fired by
    // the worker; if the visit is nearer than 24 h there is nothing sane to schedule.
    const reminderAt = input.scheduledAt.getTime() - 24 * 3_600_000
    if (reminderAt > Date.now() && outcome.kind === 'scheduled') {
      await enqueue(
        JOB.appointmentReminder,
        { appointmentId: outcome.appointmentId },
        {
          startAfterSeconds: Math.floor((reminderAt - Date.now()) / 1000),
          singletonKey: `apptrem:${outcome.appointmentId}`,
        },
      )
    }

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

    // 7.3: SURVEY_COMPLETED is what `completedEngagements` counts (`09` §History).
    await enqueue(
      JOB.analyticsRefresh,
      { companyId: actor.companyId },
      { singletonKey: `analytics:${actor.companyId}` },
    )

    return ok({ status: outcome.status })
  },
)

/**
 * One month of the manufacturer's calendar — task 14.1, the `manufacturer_project_calendar`
 * screen task 6.7 named and did not build.
 *
 * **Three kinds, because the domain has three** (`ADR-034`). The Stitch legend has four; the
 * fourth and fifth — "meetings" and "general/follow-up" — have no entity behind them, and
 * `CLAUDE.md` §Do not build these says a design existing is not a decision to build it.
 *
 * The window comes from `gridRange`, not from the month: the grid renders leading and
 * trailing cells and an appointment in one of them has to appear. Only `domain/calendar.ts`
 * knows where the grid starts, which is why the input is a year and a month.
 *
 * **No customer name reaches this surface.** `ADR-006` and `19` §Disclosure make contact data
 * a disclosure event with a record and a notification behind it; a calendar is not that. The
 * titles are project and offer references, and the second line is a city.
 */
export const listCalendar = serviceMethod<
  ListCalendarInput,
  { year: number; month: number; todayKey: string; events: CalendarEvent[] }
>(
  'offer',
  'listCalendar',
  { kind: 'permission', permission: PERMISSIONS.OFFER_REQUEST_READ },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.OFFER_REQUEST_READ)
    if (!allowed.ok) return err(allowed.error)
    /*
     * "Today" in the calendar's zone, resolved here rather than by the caller: at 00:30
     * Istanbul the UTC month can still be the previous one, and `app/` may not import the
     * domain module that knows the difference.
     */
    const todayKey = dayKey(new Date())
    const [nowYear, nowMonth] = todayKey.split('-').map(Number) as [number, number]
    const year = input.year ?? nowYear
    const month = input.month ?? nowMonth

    // Ownership in the `where`, never a post-fetch comparison (`CLAUDE.md` §3).
    if (actor.companyId === null) return ok({ year, month, todayKey, events: [] })

    const { from, to } = gridRange(year, month)
    const companyId = actor.companyId

    const [appointments, pending, sent] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          scheduledAt: { gte: from, lt: to },
          status: { not: 'CANCELLED' },
          offerRequest: { companyId },
        },
        select: {
          id: true,
          scheduledAt: true,
          offerRequestId: true,
          offerRequest: {
            select: { project: { select: { title: true, city: { select: { name: true } } } } },
          },
        },
      }),
      prisma.offerRequest.findMany({
        where: { companyId, status: 'PENDING', slaExpiresAt: { gte: from, lt: to } },
        select: {
          id: true,
          slaExpiresAt: true,
          project: { select: { title: true, city: { select: { name: true } } } },
        },
      }),
      prisma.offer.findMany({
        where: {
          status: 'SENT',
          validUntil: { gte: from, lt: to },
          offerRequest: { companyId },
        },
        select: {
          id: true,
          number: true,
          validUntil: true,
          offerRequestId: true,
          offerRequest: { select: { project: { select: { city: { select: { name: true } } } } } },
        },
      }),
    ])

    const events: CalendarEvent[] = [
      ...appointments.map((row) => ({
        id: row.id,
        kind: 'survey' as const,
        at: row.scheduledAt.toISOString(),
        offerRequestId: row.offerRequestId,
        title: row.offerRequest.project.title,
        detail: row.offerRequest.project.city?.name ?? null,
      })),
      ...pending.map((row) => ({
        id: row.id,
        kind: 'request_deadline' as const,
        at: row.slaExpiresAt.toISOString(),
        offerRequestId: row.id,
        title: row.project.title,
        detail: row.project.city?.name ?? null,
      })),
      ...sent.map((row) => ({
        id: row.id,
        kind: 'offer_expiry' as const,
        at: row.validUntil.toISOString(),
        offerRequestId: row.offerRequestId,
        title: row.number,
        detail: row.offerRequest.project.city?.name ?? null,
      })),
    ]

    events.sort((a, b) => a.at.localeCompare(b.at))
    return ok({ year, month, todayKey, events })
  },
)

export const appointmentService = {
  scheduleAppointment,
  completeAppointment,
  listCalendar,
} satisfies Record<string, { meta: unknown }>
