import { z } from 'zod'

import type { PriceBookWarning } from '../domain/diagnostics'
import type { OwnerEstimate } from './estimate-dto'

/**
 * The pricing contract (`08`), extracted from `price-book-service.ts` and
 * `simulate-service.ts` in Phase 11.2. The estimate DTOs stay in `estimate-dto.ts` (they
 * carry `ADR-006`'s type-level argument and predate this file); re-exported here so the
 * contract is one import. Runtime-pure, pinned by `dto-purity.test.ts`.
 */

export * from './estimate-dto'

/** Every mutating method scopes by company in the `where` clause — never a post-fetch check. */
const companyScoped = z.object({ companyId: z.string().min(1) })

export const listPriceBooksSchema = companyScoped
export type ListPriceBooksInput = z.infer<typeof listPriceBooksSchema>

export const getPriceBookSchema = companyScoped.extend({ priceBookId: z.string().min(1) })
export type GetPriceBookInput = z.infer<typeof getPriceBookSchema>

export const createDraftSchema = companyScoped.extend({
  /** Clone from an existing book. `08`/`3.4`: cloning is first-class, not a hidden menu. */
  fromPriceBookId: z.string().min(1).optional(),
  note: z.string().max(500).optional(),
})
export type CreateDraftInput = z.infer<typeof createDraftSchema>

export const publishPriceBookSchema = companyScoped.extend({ priceBookId: z.string().min(1) })
export type PublishPriceBookInput = z.infer<typeof publishPriceBookSchema>

const modeShape = {
  mode: z.enum(['FLAT', 'PERCENT']),
  valueKurus: z.number().int().optional().nullable(),
  percent: z.number().min(0).max(100).optional().nullable(),
}

/**
 * One call saves the whole draft.
 *
 * Field-at-a-time endpoints would mean a half-saved price book is a reachable state, and a
 * half-saved price book that someone then publishes is a wrong price. The editor holds the
 * whole book anyway (`3.4`), so the transaction boundary matches what the manufacturer
 * thinks they are doing: "save my prices".
 */
export const savePriceBookSchema = companyScoped.extend({
  priceBookId: z.string().min(1),
  note: z.string().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        basePriceKurus: z.number().int().min(0),
        unit: z.enum(['PER_M2', 'PER_M', 'PER_UNIT']),
        minProjectPriceKurus: z.number().int().min(0).default(0),
        setupFeeKurus: z.number().int().min(0).optional().nullable(),
      }),
    )
    .max(200),
  optionPrices: z
    .array(
      z.object({
        optionId: z.string().min(1),
        mode: z.enum(['FLAT', 'PER_M2', 'PER_M', 'PER_UNIT', 'PERCENT']),
        valueKurus: z.number().int().optional().nullable(),
        percent: z.number().min(0).max(100).optional().nullable(),
      }),
    )
    .max(500),
  adjustments: z
    .array(
      z.object({
        cityId: z.string().min(1).optional().nullable(),
        districtId: z.string().min(1).optional().nullable(),
        ...modeShape,
      }),
    )
    .max(300),
  rules: z
    .array(
      z.object({
        kind: z.enum(['AREA_DISCOUNT', 'VALUE_DISCOUNT', 'SIZE_SURCHARGE', 'HEIGHT_SURCHARGE']),
        thresholdMin: z.number().min(0).optional().nullable(),
        thresholdMax: z.number().min(0).optional().nullable(),
        ...modeShape,
        note: z.string().max(200).optional().nullable(),
      }),
    )
    .max(100),
})
export type SavePriceBookInput = z.infer<typeof savePriceBookSchema>

export type PriceBookSummary = {
  priceBookId: string
  version: number
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  publishedAt: Date | null
  note: string | null
  itemCount: number
  updatedAt: Date
}

export type PriceBookDetail = PriceBookSummary & {
  items: {
    productId: string
    basePriceKurus: number
    unit: 'PER_M2' | 'PER_M' | 'PER_UNIT'
    minProjectPriceKurus: number
    setupFeeKurus: number | null
  }[]
  optionPrices: {
    optionId: string
    mode: 'FLAT' | 'PER_M2' | 'PER_M' | 'PER_UNIT' | 'PERCENT'
    valueKurus: number | null
    percent: number | null
  }[]
  adjustments: {
    cityId: string | null
    districtId: string | null
    mode: 'FLAT' | 'PERCENT'
    valueKurus: number | null
    percent: number | null
  }[]
  rules: {
    id: string
    kind: 'AREA_DISCOUNT' | 'VALUE_DISCOUNT' | 'SIZE_SURCHARGE' | 'HEIGHT_SURCHARGE'
    thresholdMin: number | null
    thresholdMax: number | null
    mode: 'FLAT' | 'PERCENT'
    valueKurus: number | null
    percent: number | null
    note: string | null
  }[]
}

/* ── Simulation and the published-book estimate (simulate-service) ──────── */

export const simulateSchema = z.object({
  companyId: z.string().min(1),
  priceBookId: z.string().min(1),
  productId: z.string().min(1),
  basisType: z.enum(['AREA_M2', 'LENGTH_M', 'UNIT']),
  areaM2: z.number().min(0).optional().nullable(),
  lengthM: z.number().min(0).optional().nullable(),
  units: z.number().min(0).optional().nullable(),
  perimeterM: z.number().min(0).optional().nullable(),
  heightM: z.number().min(0).optional().nullable(),
  quantity: z.number().int().min(1).max(999).default(1),
  selectedOptionIds: z.array(z.string().min(1)).max(100).default([]),
  cityId: z.string().min(1).optional().nullable(),
  districtId: z.string().min(1).optional().nullable(),
})
export type SimulateInput = z.infer<typeof simulateSchema>

/**
 * The request shape for the published-book estimate. `priceBookId` is omitted — the
 * method resolves the PUBLISHED book itself, which is its whole difference from the
 * simulator — and `requestIp` is not here at all: the persisted anti-scraping row's IP
 * comes from the actor the adapter resolved, never from a value the client could type.
 */
export const estimateForProjectSchema = simulateSchema
  .omit({ priceBookId: true })
  .extend({ projectId: z.string().min(1).optional() })
export type EstimateForProjectInput = z.infer<typeof estimateForProjectSchema>

export type SimulateResult = {
  estimate: OwnerEstimate | null
  /** Why there is no estimate, when there is none. */
  unpricedReason: 'product-not-in-book' | 'missing-basis' | null
  /** `inspectPriceBook` — things worth fixing before this book goes live. */
  warnings: PriceBookWarning[]
  priceBookVersion: number
  priceBookStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
}
