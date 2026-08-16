import {
  addKurus,
  applyBasisPoints,
  ceilToStep,
  floorToStep,
  maxKurus,
  multiplyKurus,
  percentToBasisPoints,
  type Kurus,
} from '@/shared/money'

/**
 * The pricing engine — `08-pricing-engine.md`.
 *
 * A **pure function**: no database, no clock, no randomness, no imports that reach either.
 * The application service loads the inputs, calls this, persists a `PriceCalculation` and
 * returns a view model. Everything here is unit-testable without a container, and it is.
 *
 * Two properties are worth stating before the code, because both are deliberate and both
 * are easy to erode later:
 *
 *   **Rules are additive against the subtotal, never compounding on each other.** Ordering
 *   therefore cannot change the result, and a property test permutes the rule set to hold
 *   that. Compounding rules are how price engines become unexplainable — "why is it 8 340?"
 *   stops having an answer a human can follow.
 *
 *   **The floor is applied last** (`08` §Algorithm step 9), after rules and after the
 *   regional adjustment. A floor applied earlier would let a discount push the total below
 *   the minimum the manufacturer said it would accept, which is the one number in a price
 *   book that exists to be inviolable.
 */

/**
 * Bumped whenever the formula changes — `08` §Versioning. A formula change without a bump is
 * a defect: stored `PriceCalculation` rows carry this number, and comparisons across time
 * are silently invalidated when two different formulas share a version.
 *
 * The golden-file suite enforces it mechanically. `engine.golden.test.ts` records a checksum
 * per version; changing any expected value without adding a new version fails.
 */
export const ENGINE_VERSION = 1

export type OptionMode = 'FLAT' | 'PER_M2' | 'PER_M' | 'PER_UNIT' | 'PERCENT'
export type AdjustmentMode = 'FLAT' | 'PERCENT'
export type RuleKind = 'AREA_DISCOUNT' | 'VALUE_DISCOUNT' | 'SIZE_SURCHARGE' | 'HEIGHT_SURCHARGE'
export type ProductBasis = 'AREA_M2' | 'LENGTH_M' | 'UNIT'

/**
 * What the project contributes. Deliberately **not** a Prisma type: `Project` is Phase 4, and
 * an engine that imported it would be untestable until then and coupled to it afterwards.
 * Phase 4 maps its row onto this shape; that mapping is the only thing that has to change.
 */
export type ProjectInput = {
  productId: string
  basisType: ProductBasis
  /** The basis quantity per `basisType`. Null is a legitimate state — see `missing-basis`. */
  areaM2?: number | null
  lengthM?: number | null
  units?: number | null
  /** Derived from width and depth by the caller; `PER_M` options price against it. */
  perimeterM?: number | null
  /** `HEIGHT_SURCHARGE` reads this. */
  heightM?: number | null
  quantity: number
  selectedOptionIds: readonly string[]
  cityId?: string | null
  districtId?: string | null
}

export type PriceBookItemInput = {
  basePriceKurus: Kurus
  minProjectPriceKurus: Kurus
  setupFeeKurus?: Kurus | null
}

export type OptionPriceInput = {
  optionId: string
  mode: OptionMode
  valueKurus?: Kurus | null
  percent?: number | null
}

export type RegionAdjustmentInput = {
  cityId?: string | null
  districtId?: string | null
  mode: AdjustmentMode
  valueKurus?: Kurus | null
  percent?: number | null
}

/**
 * A rule's `valueKurus` / `percent` is a **magnitude**, and the sign comes from the kind:
 * `*_DISCOUNT` subtracts, `*_SURCHARGE` adds. The alternative — signed values — means a
 * discount typed as `+500` quietly becomes a surcharge, on a screen where the manufacturer
 * already chose the word "discount" from a menu.
 */
export type RuleInput = {
  id: string
  kind: RuleKind
  thresholdMin?: number | null
  thresholdMax?: number | null
  mode: AdjustmentMode
  valueKurus?: Kurus | null
  percent?: number | null
  note?: string | null
}

export type PriceBookInput = {
  version: number
  /** Null when this product is not in the book at all (`08` §Failure modes). */
  item: PriceBookItemInput | null
  optionPrices: readonly OptionPriceInput[]
  regionAdjustments: readonly RegionAdjustmentInput[]
  rules: readonly RuleInput[]
}

/** `PlatformSetting` values, passed in — a pure function does not read a database. */
export type BandSettings = {
  bandPercent: number
  bandMinKurus: Kurus
  roundStepKurus: Kurus
}

export type OptionLine = {
  optionId: string
  mode: OptionMode
  amountKurus: Kurus
}

export type RuleLine = {
  ruleId: string
  kind: RuleKind
  mode: AdjustmentMode
  /** Signed: negative for a discount. This is the number that was added to the subtotal. */
  amountKurus: Kurus
  note: string | null
}

/**
 * Every step of `08` §Algorithm with its inputs, so a figure can be explained months later
 * without re-running anything. Stored as `PriceCalculation.breakdown`.
 *
 * **Internal.** `ADR-006` and `PRC-03` allow this to reach the owning manufacturer and an
 * admin, never a customer — which is enforced by the type in `estimate-dto.ts`, not by
 * remembering.
 */
export type Breakdown = {
  engineVersion: number
  priceBookVersion: number
  basis: number
  basisUnit: ProductBasis
  quantity: number
  baseKurus: Kurus
  options: OptionLine[]
  optionsKurus: Kurus
  setupKurus: Kurus
  subtotalKurus: Kurus
  rules: RuleLine[]
  rulesKurus: Kurus
  regional: {
    mode: AdjustmentMode
    amountKurus: Kurus
    matchedOn: 'district' | 'city' | null
  }
  regionalKurus: Kurus
  /** Before the floor — so "the floor bound this" is visible rather than inferred. */
  preFloorKurus: Kurus
  minProjectPriceKurus: Kurus
  floorApplied: boolean
  netKurus: Kurus
  /**
   * A selected option with no price row contributed 0 (`08` §Failure modes). The estimate is
   * still shown; hiding it would be worse, because the manufacturer never learns their book
   * has a gap.
   */
  unpricedOptionIds: string[]
}

export type EstimateResult =
  | {
      status: 'priced'
      netKurus: Kurus
      bandLowKurus: Kurus
      bandHighKurus: Kurus
      breakdown: Breakdown
      /** True when an option was selected that the book does not price. */
      incomplete: boolean
      engineVersion: number
    }
  | {
      status: 'price-on-request'
      reason: 'product-not-in-book'
      engineVersion: number
    }
  | {
      status: 'unpriceable'
      reason: 'missing-basis'
      engineVersion: number
    }

/**
 * The basis quantity for a product, per `08` §Algorithm step 1.
 *
 * Returns null rather than 0 when it is absent. Zero is a real answer that happens to be
 * free; absent is a project that should never have reached the engine, and `08` §Failure
 * modes makes it a `PRECONDITION` rather than a zero-priced estimate.
 */
function resolveBasis(project: ProjectInput): number | null {
  const value =
    project.basisType === 'AREA_M2'
      ? project.areaM2
      : project.basisType === 'LENGTH_M'
        ? project.lengthM
        : project.units

  if (value === null || value === undefined) return null
  if (!Number.isFinite(value) || value < 0) return null
  return value
}

/** `08` §Algorithm, the option-mode table. */
function optionAmount(
  price: OptionPriceInput,
  context: { areaM2: number; perimeterM: number; quantity: number; baseKurus: Kurus },
): Kurus {
  const value = price.valueKurus ?? 0

  switch (price.mode) {
    case 'FLAT':
      return value
    case 'PER_M2':
      return multiplyKurus(value, context.areaM2)
    case 'PER_M':
      return multiplyKurus(value, context.perimeterM)
    case 'PER_UNIT':
      return multiplyKurus(value, context.quantity)
    case 'PERCENT':
      return applyBasisPoints(context.baseKurus, percentToBasisPoints(price.percent ?? 0))
  }
}

/**
 * What a rule measures. `AREA_DISCOUNT` and `SIZE_SURCHARGE` read the basis, `VALUE_DISCOUNT`
 * reads money, `HEIGHT_SURCHARGE` reads height — so a threshold of "40" means 40 m², ₺40 and
 * 40 m in three different rules, and the editor has to label the unit accordingly.
 */
function ruleMeasure(
  kind: RuleKind,
  context: { basis: number; subtotalKurus: Kurus; heightM: number | null },
): number | null {
  switch (kind) {
    case 'AREA_DISCOUNT':
    case 'SIZE_SURCHARGE':
      return context.basis
    case 'VALUE_DISCOUNT':
      return context.subtotalKurus
    case 'HEIGHT_SURCHARGE':
      return context.heightM
  }
}

function ruleApplies(rule: RuleInput, measure: number | null): boolean {
  // A rule whose measure is absent does not fire. A height surcharge on a project with no
  // recorded height must not silently behave as though the height were zero.
  if (measure === null) return false
  if (rule.thresholdMin !== null && rule.thresholdMin !== undefined && measure < rule.thresholdMin)
    return false
  if (rule.thresholdMax !== null && rule.thresholdMax !== undefined && measure > rule.thresholdMax)
    return false
  return true
}

function isDiscount(kind: RuleKind): boolean {
  return kind === 'AREA_DISCOUNT' || kind === 'VALUE_DISCOUNT'
}

/**
 * District beats city (`08` §Algorithm step 7). An adjustment naming neither matches nothing:
 * a "default surcharge" row would be a base price change wearing a regional hat.
 */
function pickRegional(
  adjustments: readonly RegionAdjustmentInput[],
  project: ProjectInput,
): { adjustment: RegionAdjustmentInput; matchedOn: 'district' | 'city' } | null {
  const district =
    project.districtId === null || project.districtId === undefined
      ? undefined
      : adjustments.find((row) => row.districtId === project.districtId)

  if (district !== undefined) return { adjustment: district, matchedOn: 'district' }

  const city =
    project.cityId === null || project.cityId === undefined
      ? undefined
      : adjustments.find(
          (row) =>
            row.cityId === project.cityId &&
            (row.districtId === null || row.districtId === undefined),
        )

  if (city !== undefined) return { adjustment: city, matchedOn: 'city' }

  return null
}

/**
 * `08` §Band computation. Separated because the editor and the simulator both want a band
 * without re-running an estimate, and because `EstimateBand`'s contract is easier to test
 * against one function than against the whole engine.
 *
 * The band always contains the net — a property test asserts it — because `floorTo` only
 * moves down and `ceilTo` only moves up from points either side of it.
 */
export function computeBand(
  netKurus: Kurus,
  settings: BandSettings,
): { bandLowKurus: Kurus; bandHighKurus: Kurus } {
  const percentWidth = applyBasisPoints(netKurus, percentToBasisPoints(settings.bandPercent))
  const width = maxKurus(percentWidth, settings.bandMinKurus)

  // Half the width each side. Rounded once, half away from zero, before it meets the step.
  const half = applyBasisPoints(width, 5_000)

  const low = floorToStep(netKurus - half, settings.roundStepKurus)
  const high = ceilToStep(netKurus + half, settings.roundStepKurus)

  /*
   * `20` §Unit asks for "band never negative". A floor of zero rather than a clamp of the
   * whole band: the high edge is left where it is, because widening the visible band downward
   * into negative territory and then clipping both ends would move the *high* edge for a
   * reason the customer cannot see.
   */
  return { bandLowKurus: low < 0 ? 0 : low, bandHighKurus: high }
}

/**
 * `calculateEstimate(project, priceBook)` — `08` §Position.
 *
 * The ten steps of `08` §Algorithm, in order, each rounding once at its end.
 */
export function calculateEstimate(
  project: ProjectInput,
  priceBook: PriceBookInput,
  settings: BandSettings,
): EstimateResult {
  if (priceBook.item === null) {
    return {
      status: 'price-on-request',
      reason: 'product-not-in-book',
      engineVersion: ENGINE_VERSION,
    }
  }

  const basis = resolveBasis(project)
  if (basis === null) {
    return { status: 'unpriceable', reason: 'missing-basis', engineVersion: ENGINE_VERSION }
  }

  const item = priceBook.item
  const quantity = Number.isFinite(project.quantity) && project.quantity > 0 ? project.quantity : 1

  // 2 · base
  const baseKurus = multiplyKurus(item.basePriceKurus, basis * quantity)

  // 3 · options
  const priceById = new Map(priceBook.optionPrices.map((price) => [price.optionId, price]))
  const optionContext = {
    areaM2: project.areaM2 ?? 0,
    perimeterM: project.perimeterM ?? 0,
    quantity,
    baseKurus,
  }

  const options: OptionLine[] = []
  const unpricedOptionIds: string[] = []

  for (const optionId of project.selectedOptionIds) {
    const price = priceById.get(optionId)
    if (price === undefined) {
      unpricedOptionIds.push(optionId)
      continue
    }
    options.push({ optionId, mode: price.mode, amountKurus: optionAmount(price, optionContext) })
  }

  const optionsKurus = addKurus(...options.map((line) => line.amountKurus))

  // 4 · setup, 5 · subtotal
  const setupKurus = item.setupFeeKurus ?? 0
  const subtotalKurus = addKurus(baseKurus, optionsKurus, setupKurus)

  // 6 · rules, additive against the subtotal
  const ruleContext = { basis, subtotalKurus, heightM: project.heightM ?? null }
  const ruleLines: RuleLine[] = []

  for (const rule of priceBook.rules) {
    if (!ruleApplies(rule, ruleMeasure(rule.kind, ruleContext))) continue

    const magnitude =
      rule.mode === 'FLAT'
        ? (rule.valueKurus ?? 0)
        : applyBasisPoints(subtotalKurus, percentToBasisPoints(rule.percent ?? 0))

    ruleLines.push({
      ruleId: rule.id,
      kind: rule.kind,
      mode: rule.mode,
      amountKurus: isDiscount(rule.kind) ? -magnitude : magnitude,
      note: rule.note ?? null,
    })
  }

  /*
   * Sorted for the stored breakdown only — the sum is order-independent by construction, so
   * this is about a diff between two `PriceCalculation` rows being readable, not about the
   * arithmetic. `08` §Algorithm step 6 says ascending `kind` order.
   */
  ruleLines.sort((a, b) => a.kind.localeCompare(b.kind) || a.ruleId.localeCompare(b.ruleId))
  const rulesKurus = addKurus(...ruleLines.map((line) => line.amountKurus))

  // 7 · regional, against (subtotal + rules)
  const afterRules = addKurus(subtotalKurus, rulesKurus)
  const matched = pickRegional(priceBook.regionAdjustments, project)

  const regionalKurus =
    matched === null
      ? 0
      : matched.adjustment.mode === 'FLAT'
        ? (matched.adjustment.valueKurus ?? 0)
        : applyBasisPoints(afterRules, percentToBasisPoints(matched.adjustment.percent ?? 0))

  // 8 · net, 9 · floor last
  const preFloorKurus = addKurus(subtotalKurus, rulesKurus, regionalKurus)
  const netKurus = maxKurus(preFloorKurus, item.minProjectPriceKurus)

  // 10 · band
  const { bandLowKurus, bandHighKurus } = computeBand(netKurus, settings)

  return {
    status: 'priced',
    netKurus,
    bandLowKurus,
    bandHighKurus,
    incomplete: unpricedOptionIds.length > 0,
    engineVersion: ENGINE_VERSION,
    breakdown: {
      engineVersion: ENGINE_VERSION,
      priceBookVersion: priceBook.version,
      basis,
      basisUnit: project.basisType,
      quantity,
      baseKurus,
      options,
      optionsKurus,
      setupKurus,
      subtotalKurus,
      rules: ruleLines,
      rulesKurus,
      regional: {
        mode: matched?.adjustment.mode ?? 'FLAT',
        amountKurus: regionalKurus,
        matchedOn: matched?.matchedOn ?? null,
      },
      regionalKurus,
      preFloorKurus,
      minProjectPriceKurus: item.minProjectPriceKurus,
      floorApplied: netKurus > preFloorKurus,
      netKurus,
      unpricedOptionIds,
    },
  }
}
