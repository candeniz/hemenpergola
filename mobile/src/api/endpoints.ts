import {
  completeAppointmentSchema,
  createOfferRequestsSchema,
  declineSchema,
  respondSchema,
  scheduleAppointmentSchema,
  sendOfferSchema,
  type CreateOfferRequestsInput,
  type CreateOfferRequestsResult,
  type CustomerOfferView,
  type CustomerRequestListItem,
  type DeclineInput,
  type LeadListItem,
  type LeadView,
  type OfferView,
  type ScheduleAppointmentInput,
  type SendOfferInput,
} from '@contracts/offer'
import type { MatchRunView } from '@contracts/matching'
import { sendMessageSchema, type ThreadView } from '@contracts/messaging'
import type { ProjectSummary } from '@contracts/project'
import { submitReviewSchema, type ReviewView, type SubmitReviewInput } from '@contracts/review'
import type { NotificationPreferenceView } from '@contracts/notification'

import { request, type ApiResult } from './client'

/**
 * Every `/api/v1` call the core-flow screens make — one thin function per capability, all
 * request shapes parsed with the imported contract schema BEFORE the network (the same
 * parse the route handler runs; a malformed input never spends a round trip), all response
 * shapes the services' own types. No endpoint here is new: Phase 10 built them all, and
 * `api-surface` is what says so.
 */

const invalid = <T>(): ApiResult<T> => ({
  ok: false,
  code: 'VALIDATION',
  message: 'invalid input',
})

/* ── manufacturer ───────────────────────────────────────────────────────── */

export function listLeads(companyId: string): Promise<ApiResult<{ leads: LeadListItem[] }>> {
  return request(`/companies/${companyId}/offer-requests`)
}

export function getLead(companyId: string, offerRequestId: string): Promise<ApiResult<LeadView>> {
  return request(`/companies/${companyId}/offer-requests/${offerRequestId}`)
}

export function acceptLead(
  companyId: string,
  offerRequestId: string,
): Promise<ApiResult<LeadView>> {
  const parsed = respondSchema.safeParse({ offerRequestId })
  if (!parsed.success) return Promise.resolve(invalid())
  return request(`/companies/${companyId}/offer-requests/${offerRequestId}/accept`, {
    method: 'POST',
  })
}

export function declineLead(
  companyId: string,
  input: DeclineInput,
): Promise<ApiResult<{ kind: string; status: string }>> {
  const parsed = declineSchema.safeParse(input)
  if (!parsed.success) return Promise.resolve(invalid())
  return request(`/companies/${companyId}/offer-requests/${input.offerRequestId}/decline`, {
    method: 'POST',
    body: { reason: parsed.data.reason },
  })
}

export function scheduleAppointment(
  companyId: string,
  input: ScheduleAppointmentInput,
): Promise<ApiResult<{ kind: string; status: string }>> {
  const parsed = scheduleAppointmentSchema.safeParse(input)
  if (!parsed.success) return Promise.resolve(invalid())
  return request(`/companies/${companyId}/offer-requests/${input.offerRequestId}/appointments`, {
    method: 'POST',
    body: parsed.data,
  })
}

export function completeAppointment(
  companyId: string,
  offerRequestId: string,
): Promise<ApiResult<{ kind: string; status: string }>> {
  const parsed = completeAppointmentSchema.safeParse({ offerRequestId })
  if (!parsed.success) return Promise.resolve(invalid())
  return request(`/companies/${companyId}/offer-requests/${offerRequestId}/appointments`, {
    method: 'PATCH',
  })
}

export function sendOffer(companyId: string, input: SendOfferInput): Promise<ApiResult<OfferView>> {
  const parsed = sendOfferSchema.safeParse(input)
  if (!parsed.success) return Promise.resolve(invalid())
  return request(`/companies/${companyId}/offer-requests/${input.offerRequestId}/offers`, {
    method: 'POST',
    body: parsed.data,
  })
}

export function markOutcome(
  companyId: string,
  offerRequestId: string,
  result: 'WON' | 'LOST',
  reason?: string,
): Promise<ApiResult<{ kind: string; status: string }>> {
  return request(`/companies/${companyId}/offer-requests/${offerRequestId}/outcome`, {
    method: 'POST',
    body: { result, ...(reason === undefined ? {} : { reason }) },
  })
}

/* ── customer ───────────────────────────────────────────────────────────── */

export function listProjects(): Promise<ApiResult<{ projects: ProjectSummary[] }>> {
  return request('/projects')
}

export function getMatches(projectId: string): Promise<ApiResult<MatchRunView>> {
  return request(`/projects/${projectId}/matches`)
}

export function createOfferRequests(
  input: CreateOfferRequestsInput,
): Promise<ApiResult<CreateOfferRequestsResult>> {
  const parsed = createOfferRequestsSchema.safeParse(input)
  if (!parsed.success) return Promise.resolve(invalid())
  return request('/offer-requests', { method: 'POST', body: parsed.data })
}

export function listRequests(
  projectId: string,
): Promise<ApiResult<{ requests: CustomerRequestListItem[] }>> {
  return request(`/offer-requests?projectId=${encodeURIComponent(projectId)}`)
}

export function getOffers(offerRequestId: string): Promise<ApiResult<CustomerOfferView>> {
  return request(`/offer-requests/${offerRequestId}/offer`)
}

export function decideOffer(
  offerRequestId: string,
  decision: 'accept' | 'reject',
  note?: string,
): Promise<ApiResult<{ kind: string; status: string }>> {
  return request(`/offer-requests/${offerRequestId}/offer/${decision}`, {
    method: 'POST',
    body: note === undefined ? {} : { note },
  })
}

export function reviewEligibility(
  offerRequestId: string,
): Promise<ApiResult<{ eligible: boolean; reason: string | null; review: ReviewView | null }>> {
  return request(`/offer-requests/${offerRequestId}/review/eligibility`)
}

export function submitReview(input: SubmitReviewInput): Promise<ApiResult<ReviewView>> {
  const parsed = submitReviewSchema.safeParse(input)
  if (!parsed.success) return Promise.resolve(invalid())
  return request(`/offer-requests/${input.offerRequestId}/review`, {
    method: 'POST',
    body: parsed.data,
  })
}

/* ── messaging (both sides — ADR-009's polling shape) ───────────────────── */

export function listThread(
  offerRequestId: string,
  side: 'customer' | 'company',
  companyId: string | null,
): Promise<ApiResult<ThreadView>> {
  return side === 'customer'
    ? request(`/offer-requests/${offerRequestId}/messages`)
    : request(`/companies/${companyId}/offer-requests/${offerRequestId}/messages`)
}

export function sendMessage(
  offerRequestId: string,
  side: 'customer' | 'company',
  companyId: string | null,
  body: string,
): Promise<ApiResult<{ messageId: string; sentAt: string }>> {
  const parsed = sendMessageSchema.safeParse({ offerRequestId, body })
  if (!parsed.success) return Promise.resolve(invalid())
  const path =
    side === 'customer'
      ? `/offer-requests/${offerRequestId}/messages`
      : `/companies/${companyId}/offer-requests/${offerRequestId}/messages`
  return request(path, { method: 'POST', body: { body: parsed.data.body } })
}

/* ── preferences ────────────────────────────────────────────────────────── */

export function listPreferences(): Promise<ApiResult<NotificationPreferenceView[]>> {
  return request('/me/notification-preferences')
}

export function setPreference(
  channel: 'email' | 'sms' | 'push',
  type: string,
  enabled: boolean,
): Promise<ApiResult<NotificationPreferenceView>> {
  return request('/me', { method: 'PATCH', body: { channel, type, enabled } })
}
