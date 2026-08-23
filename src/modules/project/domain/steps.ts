import { z } from 'zod'

/**
 * The wizard's shape — `ADR-013`, `10-project-configurator.md` §Step structure.
 *
 * **Three visible stages, ten logical steps**, and the progress indicator shows *stages*.
 * The `*_step_N` screens are the source of what each step contains; they are not the source
 * of how many steps a customer perceives. Ten steps on a mobile form is where drop-off
 * happens, which is the whole argument in `ADR-013`.
 *
 * Every step has a Zod schema and the **same schema runs twice** — on the client at blur and
 * on the server at `PATCH` (`10` §Validation). One schema, two callers; a second copy of a
 * rule is a rule that will disagree with itself.
 *
 * A step may be saved **incomplete**. A draft is allowed to be invalid, which is why every
 * field here is optional and why readiness is a separate pass (`readiness.ts`).
 */

export const STAGES = ['PRODUCT', 'SPECS', 'REVIEW'] as const
export type Stage = (typeof STAGES)[number]

export const STEPS = [
  'category',
  'product',
  'dimensions',
  'projectType',
  'installationType',
  'options',
  'location',
  'timing',
  'attachments',
  'summary',
] as const
export type Step = (typeof STEPS)[number]

/** `10` §Step structure's table, as data. The UI derives its stepper from this, not a copy. */
export const STEP_STAGE: Readonly<Record<Step, Stage>> = {
  category: 'PRODUCT',
  product: 'PRODUCT',
  dimensions: 'SPECS',
  projectType: 'SPECS',
  installationType: 'SPECS',
  options: 'SPECS',
  location: 'SPECS',
  timing: 'SPECS',
  attachments: 'REVIEW',
  summary: 'REVIEW',
}

export function stepsInStage(stage: Stage): Step[] {
  return STEPS.filter((step) => STEP_STAGE[step] === stage)
}

export function stageOf(step: Step): Stage {
  return STEP_STAGE[step]
}

/**
 * Dimension bounds — **the single read point for Q18**.
 *
 * `25-progress.md` Q18 asks whether snow and wind load change the permissible span by
 * region. Nobody knows yet, and the schema cannot express a regional bound: `min` and `max`
 * live on `ProductAttribute` and are global columns.
 *
 * So the assumption is *global bounds*, and it is isolated here. If the pilot answers "it
 * varies by region", the change is a migration plus this one function — the readiness check,
 * the per-step schema and the wizard all read bounds through it and none of them know where
 * the numbers come from.
 *
 * `context` is deliberately part of the signature today even though nothing reads it: a
 * caller that already passes the city cannot forget to when the answer arrives.
 */
export type DimensionBounds = {
  minMm: number
  maxMm: number
}

export type BoundsContext = {
  /** Present from the location step onward. Unused while Q18 is open — see above. */
  cityId?: string | null
  districtId?: string | null
}

/** Fallbacks when the catalogue does not state a bound. Wide enough not to reject real work. */
const DEFAULT_BOUNDS: DimensionBounds = { minMm: 500, maxMm: 30_000 }

/**
 * Which catalogue attribute keys ARE the three dimensions — the join Phase 4 never made.
 *
 * The catalogue stores its bounds on attributes named in domain Turkish (`genislik_mm`,
 * `cikinti_mm`, `yukseklik_mm`; the guillotine product uses two of them), while the project
 * row and readiness speak `widthMm`/`depthMm`/`heightMm`. Until Phase 5 nothing translated:
 * `dimensionBounds` looked attributes up by the *field* name, found nothing, and fell back
 * to the defaults — so no catalogue bound was ever enforced (Q12's ranges included) — and
 * the required-attribute rule then demanded an `optionId`-style answer to a question the
 * dimensions step had already answered, which made every real catalogue product
 * permanently un-READY. Both readers now resolve through this table, so the next dimension
 * spelling is one line here rather than a second silent miss.
 */
export const DIMENSION_ATTRIBUTE_KEYS: Record<
  'widthMm' | 'depthMm' | 'heightMm',
  readonly string[]
> = {
  widthMm: ['widthMm', 'genislik_mm'],
  depthMm: ['depthMm', 'cikinti_mm', 'derinlik_mm'],
  heightMm: ['heightMm', 'yukseklik_mm'],
}

/** The project field a catalogue attribute key answers, or null when it is a real question. */
export function dimensionFieldFor(key: string): 'widthMm' | 'depthMm' | 'heightMm' | null {
  for (const [field, keys] of Object.entries(DIMENSION_ATTRIBUTE_KEYS)) {
    if (keys.includes(key)) return field as 'widthMm' | 'depthMm' | 'heightMm'
  }
  return null
}

export function dimensionBounds(
  attribute: { min: number | null; max: number | null } | null,
  context: BoundsContext = {},
): DimensionBounds {
  // Q18: `context` is not consulted. When it is, this is the only line that changes.
  void context

  return {
    minMm: attribute?.min ?? DEFAULT_BOUNDS.minMm,
    maxMm: attribute?.max ?? DEFAULT_BOUNDS.maxMm,
  }
}

/**
 * Area in m², from millimetres — `10` §Field specifics.
 *
 * **Derived, never typed.** A customer-entered area that disagrees with the dimensions is a
 * support ticket waiting to happen, so there is no input for it and no schema field accepts
 * one. Stored alongside the raw `*Mm` values for query and indexing only.
 *
 * Rounded to four decimal places: a square millimetre is 10⁻⁶ m², and carrying that into a
 * float column makes two identical pergolas compare unequal.
 */
export function deriveAreaM2(widthMm: number | null, depthMm: number | null): number | null {
  if (widthMm === null || depthMm === null) return null
  if (!Number.isFinite(widthMm) || !Number.isFinite(depthMm)) return null
  if (widthMm <= 0 || depthMm <= 0) return null

  return Math.round(((widthMm / 1000) * (depthMm / 1000) + Number.EPSILON) * 10_000) / 10_000
}

/** Perimeter in metres, for `PER_M` option pricing in Phase 5. Same derivation rule. */
export function derivePerimeterM(widthMm: number | null, depthMm: number | null): number | null {
  if (widthMm === null || depthMm === null) return null
  if (widthMm <= 0 || depthMm <= 0) return null

  return Math.round((2 * (widthMm + depthMm)) / 10) / 100
}

const positiveMm = z.number().int().positive().max(100_000)

/**
 * One schema per step. Every field optional: a step may be saved incomplete, and refusing a
 * half-filled step would mean a customer cannot leave the wizard without finishing it.
 *
 * **`areaM2` is absent from every schema on purpose.** There is no way to send one.
 */
export const STEP_SCHEMAS = {
  category: z.object({ categoryId: z.string().min(1).optional() }),

  product: z.object({ productId: z.string().min(1).optional() }),

  dimensions: z.object({
    widthMm: positiveMm.optional().nullable(),
    depthMm: positiveMm.optional().nullable(),
    heightMm: positiveMm.optional().nullable(),
    quantity: z.number().int().min(1).max(99).optional(),
  }),

  projectType: z.object({ projectType: z.enum(['NEW_BUILD', 'RENOVATION']).optional() }),

  installationType: z.object({
    installationType: z.enum(['WALL_MOUNTED', 'FREESTANDING', 'ROOF', 'OTHER']).optional(),
  }),

  options: z.object({
    values: z
      .array(
        z.object({
          attributeId: z.string().min(1),
          optionId: z.string().min(1).optional().nullable(),
          numberValue: z.number().finite().optional().nullable(),
          boolValue: z.boolean().optional().nullable(),
          textValue: z.string().max(500).optional().nullable(),
        }),
      )
      .max(100)
      .optional(),
  }),

  location: z.object({
    cityId: z.string().min(1).optional().nullable(),
    districtId: z.string().min(1).optional().nullable(),
    addressNote: z.string().max(500).optional().nullable(),
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),
  }),

  timing: z.object({
    timing: z.enum(['ASAP', 'M1_3', 'M3_6', 'PLANNING']).optional(),
    budgetHintKurus: z.number().int().min(0).optional().nullable(),
  }),

  attachments: z.object({ note: z.string().max(2000).optional().nullable() }),

  // Nothing to write; the step exists so the summary can be reached and left.
  summary: z.object({}),
} as const satisfies Record<Step, z.ZodType>

export type StepInput<S extends Step> = z.infer<(typeof STEP_SCHEMAS)[S]>

export function isStep(value: string): value is Step {
  return (STEPS as readonly string[]).includes(value)
}
