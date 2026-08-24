'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

import type { CreateOfferRequestsResult } from '@/modules/offer/application/offer-request-service'
import type { LeadView } from '@/modules/offer/application/lead-dto'
import type { OfferView } from '@/modules/offer/application/offer-service'
import type { OfferRequestStatus } from '@/modules/offer/application/offer-request-service'
import type { DomainError, Result } from '@/shared/result'

/**
 * The lifecycle's server actions — tasks 6.3–6.9. Same construction as `project.ts`:
 * `await import()` for every value (`CLAUDE.md` non-negotiable 9), the services' own Zod
 * schemas, no scoping here — ownership and permissions are the services'.
 */

async function actor(companyId?: string) {
  const [{ headers }, { resolveActor }] = await Promise.all([
    import('next/headers'),
    import('@/shared/context/actor'),
  ])
  const requestHeaders = await headers()

  return resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    // The company comes from the caller's route segment, the same way the panel pages pass
    // it — `resolveActor` verifies the membership; an unfounded claim yields no role.
    companyId === undefined ? {} : { companyId },
  )
}

async function run<T>(
  schema: { safeParse: (value: unknown) => unknown },
  call: (
    caller: Awaited<ReturnType<typeof actor>>,
    input: never,
  ) => Promise<Result<T, DomainError>>,
  input: unknown,
): Promise<ActionResult<T>> {
  const { err, validation } = await import('@/shared/result')

  const parsed = schema.safeParse(input) as
    | { success: true; data: unknown }
    | { success: false; error: { issues: Parameters<typeof validation>[0] } }

  if (!parsed.success) return actionResult(err(validation(parsed.error.issues)))

  // Manufacturer calls carry the panel's company segment alongside the service input; the
  // schema strips it, the actor is built with it.
  const companyId =
    typeof input === 'object' && input !== null && 'companyId' in input
      ? (input as { companyId?: unknown }).companyId
      : undefined

  return actionResult(
    await call(
      await actor(typeof companyId === 'string' ? companyId : undefined),
      parsed.data as never,
    ),
  )
}

const requests = () => import('@/modules/offer/application/offer-request-service')
const offers = () => import('@/modules/offer/application/offer-service')
const appointments = () => import('@/modules/offer/application/appointment-service')

export async function createOfferRequestsAction(
  input: unknown,
): Promise<ActionResult<CreateOfferRequestsResult>> {
  const service = await requests()
  return run(service.createOfferRequestsSchema, (a, d) => service.createOfferRequests(a, d), input)
}

export async function acceptOfferRequestAction(input: unknown): Promise<ActionResult<LeadView>> {
  const service = await requests()
  return run(service.respondSchema, (a, d) => service.acceptOfferRequest(a, d), input)
}

export async function declineOfferRequestAction(
  input: unknown,
): Promise<ActionResult<{ offerRequestId: string; status: OfferRequestStatus }>> {
  const service = await requests()
  return run(service.declineSchema, (a, d) => service.declineOfferRequest(a, d), input)
}

export async function scheduleAppointmentAction(
  input: unknown,
): Promise<ActionResult<{ appointmentId: string; status: OfferRequestStatus }>> {
  const service = await appointments()
  return run(service.scheduleAppointmentSchema, (a, d) => service.scheduleAppointment(a, d), input)
}

export async function completeAppointmentAction(
  input: unknown,
): Promise<ActionResult<{ status: OfferRequestStatus }>> {
  const service = await appointments()
  return run(service.completeAppointmentSchema, (a, d) => service.completeAppointment(a, d), input)
}

export async function sendOfferAction(input: unknown): Promise<ActionResult<OfferView>> {
  const service = await offers()
  return run(service.sendOfferSchema, (a, d) => service.sendOffer(a, d), input)
}

export async function acceptOfferAction(
  input: unknown,
): Promise<ActionResult<{ offerRequestId: string; status: OfferRequestStatus }>> {
  const service = await offers()
  return run(service.decideOfferSchema, (a, d) => service.acceptOffer(a, d), input)
}

export async function rejectOfferAction(
  input: unknown,
): Promise<ActionResult<{ offerRequestId: string; status: OfferRequestStatus }>> {
  const service = await offers()
  return run(service.decideOfferSchema, (a, d) => service.rejectOffer(a, d), input)
}

export async function markWonAction(
  input: unknown,
): Promise<ActionResult<{ offerRequestId: string; status: OfferRequestStatus }>> {
  const service = await offers()
  return run(service.markOutcomeSchema, (a, d) => service.markWon(a, d), input)
}

export async function markLostAction(
  input: unknown,
): Promise<ActionResult<{ offerRequestId: string; status: OfferRequestStatus }>> {
  const service = await offers()
  return run(service.markOutcomeSchema, (a, d) => service.markLost(a, d), input)
}

export async function closeOfferRequestAction(
  input: unknown,
): Promise<ActionResult<{ offerRequestId: string; status: OfferRequestStatus }>> {
  const service = await requests()
  return run(service.closeOfferRequestSchema, (a, d) => service.closeOfferRequest(a, d), input)
}
