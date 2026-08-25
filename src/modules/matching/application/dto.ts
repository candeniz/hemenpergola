import { z } from 'zod'

/**
 * The matching contract (`09`), extracted from `match-service.ts` and
 * `service-area-service.ts` in Phase 11.2 — one file for the module, because
 * `@contracts/matching` resolves one path. Runtime-pure, pinned by `dto-purity.test.ts`.
 */

/* ── Match runs (match-service) ─────────────────────────────────────────── */

export const runMatchSchema = z.object({ projectId: z.string().min(1) })
export type RunMatchInput = z.infer<typeof runMatchSchema>

export const getMatchRunSchema = z.object({ projectId: z.string().min(1) })
export type GetMatchRunInput = z.infer<typeof getMatchRunSchema>

export const zeroResultFallbackSchema = z.object({ projectId: z.string().min(1) })
export type ZeroResultFallbackInput = z.infer<typeof zeroResultFallbackSchema>

export const watchSupplyGapSchema = z.object({ projectId: z.string().min(1) })
export type WatchSupplyGapInput = z.infer<typeof watchSupplyGapSchema>

export type MatchPriceState = 'PRICED' | 'ON_REQUEST' | 'UNAVAILABLE'

/**
 * What the **customer** sees per result. Band only, never line items (`ADR-006`), and no
 * score number — `09` §Explainability gives the customer a sentence, the admin the numbers.
 */
export type MatchResultView = {
  rank: number
  companyId: string
  displayName: string
  bandLowKurus: number | null
  bandHighKurus: number | null
  priceOnRequest: boolean
  priceState: MatchPriceState
  /** An option the book does not price contributed zero — shown as a caveat, not hidden. */
  incomplete: boolean
  distanceKm: number | null
}

export type MatchRunView = {
  matchRunId: string
  projectId: string
  createdAt: Date
  resultCount: number
  results: MatchResultView[]
}

export type ZeroResultFallbackView = {
  /** `09` step 1 — the radius test widened by one step, labelled by the caller. */
  widened: MatchResultView[]
  /** `09` step 2 — serve the area, do not offer the product. Names only, no bands. */
  nearby: { companyId: string; displayName: string }[]
  widenedByKm: number
}

/* ── Service areas (service-area-service) ───────────────────────────────── */

export const listServiceAreasSchema = z.object({ companyId: z.string().min(1) })
export type ListServiceAreasInput = z.infer<typeof listServiceAreasSchema>

export const addServiceAreaSchema = z
  .object({
    companyId: z.string().min(1),
    kind: z.enum(['CITY', 'DISTRICT', 'RADIUS']),
    cityId: z.string().min(1).optional(),
    districtId: z.string().min(1).optional(),
    /** `09`: kilometres. Under 5 km is a street, over 500 km is the whole country. */
    radiusKm: z.number().int().min(5).max(500).optional(),
    centerLabel: z.string().trim().max(200).optional(),
  })
  .refine((value) => value.kind !== 'CITY' || value.cityId !== undefined, {
    message: 'a CITY area needs a city',
    path: ['cityId'],
  })
  .refine((value) => value.kind !== 'DISTRICT' || value.districtId !== undefined, {
    message: 'a DISTRICT area needs a district',
    path: ['districtId'],
  })
  .refine((value) => value.kind !== 'RADIUS' || value.radiusKm !== undefined, {
    message: 'a RADIUS area needs a radius',
    path: ['radiusKm'],
  })
export type AddServiceAreaInput = z.infer<typeof addServiceAreaSchema>

export const removeServiceAreaSchema = z.object({
  companyId: z.string().min(1),
  serviceAreaId: z.string().min(1),
})
export type RemoveServiceAreaInput = z.infer<typeof removeServiceAreaSchema>

export type ServiceAreaView = {
  id: string
  kind: 'CITY' | 'DISTRICT' | 'RADIUS'
  cityId: string | null
  cityName: string | null
  districtId: string | null
  districtName: string | null
  radiusKm: number | null
  centerLabel: string | null
  isActive: boolean
  /** `null` while the geocode job has not run, or could not resolve a centre. */
  centre: { latitude: number; longitude: number } | null
}

export const coversPointSchema = z.object({
  cityId: z.string().min(1),
  districtId: z.string().min(1).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})
export type CoversPointInput = z.infer<typeof coversPointSchema>

export const listCitiesSchema = z.object({})
export type ListCitiesInput = z.infer<typeof listCitiesSchema>

export const listDistrictsSchema = z.object({})
export type ListDistrictsInput = z.infer<typeof listDistrictsSchema>
