import { z } from 'zod'

import type { OfferRequestStatus } from '../domain/state-machine'

/**
 * The offer-lifecycle contract (`11`), extracted from the three service files in Phase
 * 11.2 — one file for the module, because `@contracts/offer` resolves one path. The lead
 * DTOs stay in `lead-dto.ts` (they predate this file and carry the disclosure boundary's
 * whole argument); this file re-exports them, so the contract surface is one import
 * either way. Runtime-pure, pinned by `dto-purity.test.ts`.
 */

export * from './lead-dto'

/* ── Requests (offer-request-service) ───────────────────────────────────── */

export const createOfferRequestsSchema = z.object({
  projectId: z.string().min(1),
  companyIds: z.array(z.string().min(1)).min(1).max(5),
  consent: z.object({
    /**
     * `06`: `consent.accepted !== true` → 422. `literal(true)` makes the invalid shape
     * unrepresentable rather than checked.
     */
    accepted: z.literal(true),
    textVersion: z.string().min(1),
  }),
})
export type CreateOfferRequestsInput = z.infer<typeof createOfferRequestsSchema>

export const respondSchema = z.object({ offerRequestId: z.string().min(1) })
export type RespondInput = z.infer<typeof respondSchema>

export const declineSchema = z.object({
  offerRequestId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
})
export type DeclineInput = z.infer<typeof declineSchema>

export const getLeadSchema = z.object({ offerRequestId: z.string().min(1) })
export type GetLeadInput = z.infer<typeof getLeadSchema>

export type CreateOfferRequestsResult = {
  created: { offerRequestId: string; companyId: string }[]
  slaExpiresAt: Date
}

export const listLeadsSchema = z.object({}).optional()
export type ListLeadsInput = z.infer<typeof listLeadsSchema>

export type LeadListItem = {
  offerRequestId: string
  status: OfferRequestStatus
  slaExpiresAt: Date
  createdAt: Date
  productId: string
  areaM2: number | null
  cityName: string | null
  districtName: string | null
}

export const listRequestsForProjectSchema = z.object({ projectId: z.string().min(1) })
export type ListRequestsForProjectInput = z.infer<typeof listRequestsForProjectSchema>

export type CustomerRequestListItem = {
  offerRequestId: string
  companyId: string
  companyName: string
  status: OfferRequestStatus
  slaExpiresAt: Date
  createdAt: Date
}

export const closeOfferRequestSchema = z.object({
  offerRequestId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
})
export type CloseOfferRequestInput = z.infer<typeof closeOfferRequestSchema>

/* ── Offers (offer-service) ─────────────────────────────────────────────── */

const offerLineSchema = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.number().positive().max(10_000),
  unit: z.string().trim().min(1).max(20),
  unitPriceKurus: z.number().int().positive(),
})

export const sendOfferSchema = z.object({
  offerRequestId: z.string().min(1),
  lines: z.array(offerLineSchema).min(1).max(50),
  /** Defaults from `PlatformSetting('tax.kdv_default_percent')` — Q6's unconfirmed 20. */
  taxRate: z.number().min(0).max(100).optional(),
  validUntil: z.coerce.date(),
  note: z.string().trim().max(1000).optional(),
})
export type SendOfferInput = z.infer<typeof sendOfferSchema>

export const decideOfferSchema = z.object({
  offerRequestId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
})
export type DecideOfferInput = z.infer<typeof decideOfferSchema>

export const markOutcomeSchema = z.object({
  offerRequestId: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
})
export type MarkOutcomeInput = z.infer<typeof markOutcomeSchema>

export type OfferView = {
  offerId: string
  number: string
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED'
  netKurus: number
  taxRate: number
  taxKurus: number
  grossKurus: number
  validUntil: Date
  note: string | null
  sentAt: Date | null
  lines: {
    description: string
    quantity: number
    unit: string
    unitPriceKurus: number
    lineNetKurus: number
  }[]
}

export const getOffersForRequestSchema = z.object({ offerRequestId: z.string().min(1) })
export type GetOffersForRequestInput = z.infer<typeof getOffersForRequestSchema>

export type CustomerOfferView = {
  offerRequestId: string
  requestStatus: OfferRequestStatus
  companyName: string
  /** Every version, newest first — a revision supersedes but stays readable (`11`). */
  offers: OfferView[]
  /**
   * The estimate the customer originally saw, band only (`ADR-006`), so the offer screen
   * explains the gap in place (`ADR-007`): the estimate was net of KDV, the offer is not.
   */
  originalEstimate: { bandLowKurus: number; bandHighKurus: number } | null
}

/* ── Appointments (appointment-service) ─────────────────────────────────── */

export const scheduleAppointmentSchema = z.object({
  offerRequestId: z.string().min(1),
  scheduledAt: z.coerce.date(),
  durationMin: z.number().int().min(15).max(480).default(60),
  note: z.string().trim().max(500).optional(),
})
export type ScheduleAppointmentInput = z.infer<typeof scheduleAppointmentSchema>

export const completeAppointmentSchema = z.object({ offerRequestId: z.string().min(1) })
export type CompleteAppointmentInput = z.infer<typeof completeAppointmentSchema>

/* ── Calendar (appointment-service) ─────────────────────────────────────── */

/**
 * One month of the manufacturer calendar (task 14.1). Year and month rather than a date
 * range, because the range is the SIX-WEEK GRID and only `domain/calendar.ts` knows where
 * that starts — a caller passing `from`/`to` would be reimplementing it, and eventually
 * disagreeing with the grid it is filling.
 *
 * Both are **optional**, and the service resolves the missing ones to the current month in
 * `Europe/Istanbul`. That resolution cannot live in the caller: `app/` may not import a
 * domain module (`CLAUDE.md` non-negotiable 2), and "which month is it right now" is a
 * time-zone question `domain/calendar.ts` owns. So the answer comes back in the result.
 */
export const listCalendarSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
})
export type ListCalendarInput = z.infer<typeof listCalendarSchema>
