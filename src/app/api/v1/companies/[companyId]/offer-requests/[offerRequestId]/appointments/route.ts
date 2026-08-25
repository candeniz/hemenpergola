import { respond } from '@/shared/http/respond'

/**
 * The site survey — `11` §Transition table, `ACCEPTED → SURVEY_SCHEDULED` (`POST`) and
 * `SURVEY_SCHEDULED → SURVEY_COMPLETED` (`PATCH`). Actor: manufacturer.
 *
 * **`06` line 153 sketched `PATCH /companies/{id}/appointments/{appointmentId}` and that
 * path cannot be built.** `completeAppointmentSchema` is keyed by `offerRequestId`, because
 * an offer request has one live appointment and the transition belongs to the request's
 * state machine, not to an appointment row read on its own. Rather than reshape a service
 * to fit a sketch, `06` is corrected to the path that matches the model — the specification
 * was written before the state machine existed.
 *
 * `scheduledAt` in the future, and in the past to complete, are `11`'s guards, checked in
 * the service against the server's clock rather than a timestamp the caller sends.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; offerRequestId: string }> },
): Promise<Response> {
  const [
    { scheduleAppointmentSchema, scheduleAppointment },
    { resolveActor },
    { err, validation },
  ] = await Promise.all([
    import('@/modules/offer/application/appointment-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const { companyId, offerRequestId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = scheduleAppointmentSchema.safeParse({ ...(body ?? {}), offerRequestId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await scheduleAppointment(actor, parsed.data))
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ companyId: string; offerRequestId: string }> },
): Promise<Response> {
  const [
    { completeAppointmentSchema, completeAppointment },
    { resolveActor },
    { err, validation },
  ] = await Promise.all([
    import('@/modules/offer/application/appointment-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const { companyId, offerRequestId } = await params
  const parsed = completeAppointmentSchema.safeParse({ offerRequestId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await completeAppointment(actor, parsed.data))
}
