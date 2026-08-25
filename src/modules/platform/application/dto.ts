import { z } from 'zod'

/**
 * The platform-settings contract (`17`, `ADM-06`), extracted from `settings-service.ts`
 * in Phase 11.2. Runtime-pure, pinned by `dto-purity.test.ts`.
 */

export const listSettingsSchema = z.object({})
export type ListSettingsInput = z.infer<typeof listSettingsSchema>

export const updateSettingSchema = z.object({
  key: z.string().min(1).max(120),
  /** Every setting in the catalogue is currently a number; the schema per key is the gate. */
  value: z.unknown(),
  /** `17`: writes that affect standing require a reason. Settings move money, so they do. */
  reason: z.string().trim().min(3).max(400),
})
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>

export type SettingView = {
  key: string
  value: unknown
  unit: 'percent' | 'kurus' | 'hours' | 'count'
  rationale: string
  source: string
  updatedAt: Date | null
  updatedBy: string | null
  /** True when the row is missing and the screen is showing nothing rather than a value. */
  unset: boolean
}

export type UpdateSettingResult = { key: string; value: unknown; previous: unknown }

export const dashboardCountsSchema = z.object({})
export type DashboardCountsInput = z.infer<typeof dashboardCountsSchema>

export type DashboardCounts = {
  pendingManufacturers: number
  catalogCategories: number
  catalogProducts: number
}
