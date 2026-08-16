import {
  calculateEstimate,
  type BandSettings,
  type PriceBookInput,
  type ProjectInput,
} from './engine'

/**
 * Checks a price book makes sense before it is published — the half of `3.4` that keeps the
 * editor from being a form-shaped transcription of the schema.
 *
 * **Why this exists.** `20-testing-strategy.md` §Unit asks for a property test that *"net is
 * monotonic in area"*, and that property is **not** universally true of this engine — by
 * design. A threshold rule can make a larger project cost less in total than a smaller one:
 *
 *     base ₺100/m², AREA_DISCOUNT of 10% for area ≥ 100
 *       99 m² → ₺9 900
 *      100 m² → ₺10 000 − 10% = ₺9 000
 *
 * The engine is behaving exactly as the manufacturer configured it. The manufacturer,
 * however, has almost certainly not noticed, and the effect is a customer who is charged less
 * for asking for more. So monotonicity is enforced where it belongs — as a property of a
 * *price book*, reported to its owner — rather than as a property of the arithmetic, which
 * would require dropping threshold discounts altogether.
 *
 * The engine test asserts monotonicity over rule-free books, where it *is* an arithmetic
 * property. This function covers the rest.
 */

export type PriceBookWarning =
  | {
      kind: 'non-monotonic-in-basis'
      /** The basis value just below the inversion, and the one just at or above it. */
      atBasis: number
      previousBasis: number
      netKurus: number
      previousNetKurus: number
    }
  | {
      kind: 'rule-never-fires'
      ruleId: string
    }
  | {
      kind: 'floor-dominates'
      /** Every probe came out at the floor: the base price is doing nothing. */
      minProjectPriceKurus: number
    }

/**
 * Probe the book across a range of basis values and report where it misbehaves.
 *
 * A sampled sweep rather than a proof. The alternative is symbolic analysis of an arbitrary
 * rule set, which is a great deal of machinery for a screen whose job is to tell a
 * manufacturer "your 100 m² price is lower than your 99 m² price". The sweep steps at 1 unit
 * up to the largest configured threshold plus a margin, so every threshold boundary is
 * crossed — thresholds are where inversions live.
 */
export function inspectPriceBook(
  project: ProjectInput,
  priceBook: PriceBookInput,
  settings: BandSettings,
): PriceBookWarning[] {
  const warnings: PriceBookWarning[] = []
  if (priceBook.item === null) return warnings

  const thresholds = priceBook.rules.flatMap((rule) =>
    [rule.thresholdMin, rule.thresholdMax].filter(
      (value): value is number => value !== null && value !== undefined && Number.isFinite(value),
    ),
  )

  const ceiling = Math.min(Math.max(20, ...thresholds.map((value) => value + 5)), 500)

  let previousNet: number | null = null
  let previousBasis = 0
  let everAboveFloor = false
  const firedRuleIds = new Set<string>()

  for (let basis = 1; basis <= ceiling; basis += 1) {
    const probe: ProjectInput = {
      ...project,
      areaM2: project.basisType === 'AREA_M2' ? basis : project.areaM2,
      lengthM: project.basisType === 'LENGTH_M' ? basis : project.lengthM,
      units: project.basisType === 'UNIT' ? basis : project.units,
    }

    const result = calculateEstimate(probe, priceBook, settings)
    if (result.status !== 'priced') continue

    result.breakdown.rules.forEach((line) => firedRuleIds.add(line.ruleId))
    if (!result.breakdown.floorApplied) everAboveFloor = true

    if (previousNet !== null && result.netKurus < previousNet) {
      warnings.push({
        kind: 'non-monotonic-in-basis',
        atBasis: basis,
        previousBasis,
        netKurus: result.netKurus,
        previousNetKurus: previousNet,
      })
    }

    previousNet = result.netKurus
    previousBasis = basis
  }

  for (const rule of priceBook.rules) {
    // A rule that never fires across the whole probed range is almost always a threshold
    // typed in the wrong unit — ₺40 000 entered as 40 000 kuruş, or metres as centimetres.
    if (!firedRuleIds.has(rule.id)) warnings.push({ kind: 'rule-never-fires', ruleId: rule.id })
  }

  if (!everAboveFloor) {
    warnings.push({
      kind: 'floor-dominates',
      minProjectPriceKurus: priceBook.item.minProjectPriceKurus,
    })
  }

  return warnings
}
