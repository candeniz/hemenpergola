import { z } from 'zod'

/**
 * The platform settings, their types and their **valid ranges** —
 * `17-admin-system.md` §Platform settings, `ADM-06`.
 *
 * The range is the point. A setting is a value somebody can change at three in the morning
 * without a deploy and without review; if `pricing.band_percent` accepts 900 then it is not
 * a setting, it is a way to show every customer a price band ten times wider than the
 * estimate, live, with no code change and no way to tell from the schema that it was
 * possible.
 *
 * Each entry carries the bound *and the reason for it*, because a bound with no stated
 * reason is the first thing somebody widens when a value is refused.
 */

export type SettingDefinition = {
  key: string
  schema: z.ZodType
  /** What the number means, in the admin's language — rendered as help text. */
  unit: 'percent' | 'kurus' | 'hours' | 'count'
  /** Why the range is what it is. Shown next to the field, not only in this file. */
  rationale: string
  source: string
}

/**
 * A percentage that is actually a percentage. `0` means "show the exact figure", which is a
 * legitimate configuration; above 50 the band is wider than the estimate and stops being
 * information (`ADR-006` — the band exists to protect the manufacturer's price, not to hide
 * it entirely).
 */
const percent = z.number().int().min(0).max(50)

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  {
    key: 'pricing.band_percent',
    schema: percent,
    unit: 'percent',
    rationale:
      'A band wider than half the estimate tells the customer nothing. 0 is allowed and means the exact figure.',
    source: '08 §Band computation, ADR-006',
  },
  {
    key: 'pricing.band_min_kurus',
    schema: z.number().int().min(0).max(10_000_00),
    unit: 'kurus',
    rationale:
      'A floor so that a small project still gets a band rather than a false-precision point estimate. Capped at ₺10 000, beyond which the floor dominates every project the platform sells.',
    source: '08 §Band computation',
  },
  {
    key: 'pricing.round_step_kurus',
    schema: z.number().int().min(100).max(1_000_00),
    unit: 'kurus',
    rationale:
      'Rounding step for the displayed band. Below ₺1 it is not rounding; above ₺1 000 the band edges move more than the band width.',
    source: '08 §Band computation',
  },
  {
    key: 'offer_request.sla_hours',
    schema: z.number().int().min(1).max(168),
    unit: 'hours',
    rationale:
      'Under an hour no manufacturer can answer; over a week the customer has bought from somebody else. Q7 — 48 is a guess until there is real data.',
    source: '11 §SLA',
  },
  {
    key: 'tax.kdv_default_percent',
    schema: z.number().int().min(0).max(100),
    unit: 'percent',
    rationale:
      'A statutory rate, so the bound is the legal range rather than a judgement. Q6 — confirm 20% with an accountant before Phase 6.',
    source: '11 §Offers and KDV',
  },
  {
    key: 'matching.max_companies_per_project',
    schema: z.number().int().min(1).max(10),
    unit: 'count',
    rationale:
      'Above ten, a request is spray-and-pray and manufacturers learn to ignore leads — which is the failure `09` §Ranking and limits exists to prevent.',
    source: '09 §Ranking and limits',
  },
] as const

const BY_KEY = new Map(SETTING_DEFINITIONS.map((definition) => [definition.key, definition]))

export function settingDefinition(key: string): SettingDefinition | undefined {
  return BY_KEY.get(key)
}

export type SettingValidation =
  | { valid: true; value: unknown }
  | { valid: false; reason: 'unknown-key' }
  | { valid: false; reason: 'out-of-range'; message: string; rationale: string }

/**
 * Validate a value against its key.
 *
 * An unknown key is refused rather than stored. `PlatformSetting` is a key-value table, so
 * nothing in the database stops an admin — or a typo in a form — from creating
 * `pricing.band_percnt`, which would then sit there being ignored while the real setting
 * keeps its old value and everybody wonders why the change did nothing.
 */
export function validateSetting(key: string, value: unknown): SettingValidation {
  const definition = BY_KEY.get(key)
  if (definition === undefined) return { valid: false, reason: 'unknown-key' }

  const parsed = definition.schema.safeParse(value)
  if (!parsed.success) {
    return {
      valid: false,
      reason: 'out-of-range',
      message: parsed.error.issues.map((issue) => issue.message).join('; '),
      rationale: definition.rationale,
    }
  }

  return { valid: true, value: parsed.data }
}
