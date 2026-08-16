import { describe, expect, it } from 'vitest'

import {
  calculateEstimate,
  computeBand,
  ENGINE_VERSION,
  type BandSettings,
  type PriceBookInput,
  type ProjectInput,
  type RuleInput,
} from './engine'

/**
 * `20-testing-strategy.md` §Unit, item by item:
 *
 *   each option mode: FLAT, PER_M2, PER_M, PER_UNIT, PERCENT
 *   min project price floor applies last, after rules and regional
 *   regional FLAT and PERCENT; district overrides city
 *   rounding: half away from zero, once per step; kuruş never fractional
 *   band: percent vs min width, rounding step, band never negative
 *   zero/absent basis, missing option price, empty rule set
 *   property test: net is monotonic in area; band always contains net
 *
 * No database, no mocks. The engine is pure, so the test is arithmetic.
 */

const SETTINGS: BandSettings = {
  bandPercent: 10,
  bandMinKurus: 500_00,
  roundStepKurus: 500_00,
}

function project(overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
    productId: 'prd_pergola',
    basisType: 'AREA_M2',
    areaM2: 20,
    perimeterM: 18,
    heightM: 3,
    quantity: 1,
    selectedOptionIds: [],
    cityId: 'city_istanbul',
    districtId: 'dst_kadikoy',
    ...overrides,
  }
}

function book(overrides: Partial<PriceBookInput> = {}): PriceBookInput {
  return {
    version: 1,
    item: { basePriceKurus: 1_000_00, minProjectPriceKurus: 0, setupFeeKurus: 0 },
    optionPrices: [],
    regionAdjustments: [],
    rules: [],
    ...overrides,
  }
}

function priced(result: ReturnType<typeof calculateEstimate>) {
  if (result.status !== 'priced') throw new Error(`expected priced, got ${result.status}`)
  return result
}

describe('option modes', () => {
  // ₺1 000/m² × 20 m² = ₺20 000 base in every case below.
  const base = 20_000_00

  it('FLAT adds its value once, regardless of size', () => {
    const result = priced(
      calculateEstimate(
        project({ selectedOptionIds: ['opt'] }),
        book({ optionPrices: [{ optionId: 'opt', mode: 'FLAT', valueKurus: 1_500_00 }] }),
        SETTINGS,
      ),
    )
    expect(result.breakdown.optionsKurus).toBe(1_500_00)
    expect(result.breakdown.subtotalKurus).toBe(base + 1_500_00)
  })

  it('PER_M2 multiplies by area, not by the basis', () => {
    // The distinction matters for a LENGTH_M product carrying a per-m² option.
    const result = priced(
      calculateEstimate(
        project({ selectedOptionIds: ['opt'] }),
        book({ optionPrices: [{ optionId: 'opt', mode: 'PER_M2', valueKurus: 50_00 }] }),
        SETTINGS,
      ),
    )
    expect(result.breakdown.optionsKurus).toBe(50_00 * 20)
  })

  it('PER_M multiplies by perimeter', () => {
    const result = priced(
      calculateEstimate(
        project({ selectedOptionIds: ['opt'] }),
        book({ optionPrices: [{ optionId: 'opt', mode: 'PER_M', valueKurus: 100_00 }] }),
        SETTINGS,
      ),
    )
    expect(result.breakdown.optionsKurus).toBe(100_00 * 18)
  })

  it('PER_UNIT multiplies by quantity', () => {
    const result = priced(
      calculateEstimate(
        project({ selectedOptionIds: ['opt'], quantity: 3 }),
        book({ optionPrices: [{ optionId: 'opt', mode: 'PER_UNIT', valueKurus: 250_00 }] }),
        SETTINGS,
      ),
    )
    expect(result.breakdown.optionsKurus).toBe(250_00 * 3)
  })

  it('PERCENT is a percentage of base, not of subtotal', () => {
    /*
     * `08`'s table says `base * percent / 100`. Against the subtotal it would compound with
     * whatever option happened to be listed first — the exact non-determinism the additive
     * rule design exists to avoid.
     */
    const result = priced(
      calculateEstimate(
        project({ selectedOptionIds: ['flat', 'pct'] }),
        book({
          optionPrices: [
            { optionId: 'flat', mode: 'FLAT', valueKurus: 5_000_00 },
            { optionId: 'pct', mode: 'PERCENT', percent: 10 },
          ],
        }),
        SETTINGS,
      ),
    )

    const percentLine = result.breakdown.options.find((line) => line.optionId === 'pct')
    expect(percentLine?.amountKurus).toBe(base / 10)
  })
})

describe('the floor applies last', () => {
  it('binds after rules and after the regional adjustment', () => {
    /*
     * `08` §Algorithm step 9, and the reason it is step 9. Base ₺2 000, a 50% discount and a
     * −₺500 regional adjustment would land at ₺500; the floor is ₺1 500, so ₺1 500 is the
     * answer. A floor applied at step 5 would have produced ₺2 000 − discounts = ₺500.
     */
    const result = priced(
      calculateEstimate(
        project({ areaM2: 2 }),
        book({
          item: { basePriceKurus: 1_000_00, minProjectPriceKurus: 1_500_00, setupFeeKurus: 0 },
          rules: [
            { id: 'r1', kind: 'VALUE_DISCOUNT', thresholdMin: 0, mode: 'PERCENT', percent: 50 },
          ],
          regionAdjustments: [{ districtId: 'dst_kadikoy', mode: 'FLAT', valueKurus: -500_00 }],
        }),
        SETTINGS,
      ),
    )

    expect(result.breakdown.subtotalKurus).toBe(2_000_00)
    expect(result.breakdown.rulesKurus).toBe(-1_000_00)
    expect(result.breakdown.regionalKurus).toBe(-500_00)
    expect(result.breakdown.preFloorKurus).toBe(500_00)
    expect(result.breakdown.floorApplied).toBe(true)
    expect(result.netKurus).toBe(1_500_00)
  })

  it('does not bind when the total clears it', () => {
    const result = priced(
      calculateEstimate(
        project(),
        book({
          item: { basePriceKurus: 1_000_00, minProjectPriceKurus: 1_500_00, setupFeeKurus: 0 },
        }),
        SETTINGS,
      ),
    )
    expect(result.breakdown.floorApplied).toBe(false)
    expect(result.netKurus).toBe(20_000_00)
  })
})

describe('regional adjustment', () => {
  it('applies FLAT — the case the design shows as “Kocaeli +₺10 000”', () => {
    const result = priced(
      calculateEstimate(
        project(),
        book({
          regionAdjustments: [{ cityId: 'city_istanbul', mode: 'FLAT', valueKurus: 10_000_00 }],
        }),
        SETTINGS,
      ),
    )
    expect(result.breakdown.regionalKurus).toBe(10_000_00)
    expect(result.breakdown.regional.matchedOn).toBe('city')
  })

  it('applies PERCENT against subtotal plus rules', () => {
    const result = priced(
      calculateEstimate(
        project(),
        book({ regionAdjustments: [{ cityId: 'city_istanbul', mode: 'PERCENT', percent: 15 }] }),
        SETTINGS,
      ),
    )
    expect(result.breakdown.regionalKurus).toBe(3_000_00)
  })

  it('lets the district override the city', () => {
    const result = priced(
      calculateEstimate(
        project(),
        book({
          regionAdjustments: [
            { cityId: 'city_istanbul', mode: 'FLAT', valueKurus: 10_000_00 },
            { districtId: 'dst_kadikoy', mode: 'FLAT', valueKurus: 2_000_00 },
          ],
        }),
        SETTINGS,
      ),
    )
    expect(result.breakdown.regional.matchedOn).toBe('district')
    expect(result.breakdown.regionalKurus).toBe(2_000_00)
  })

  it('matches nothing when neither the city nor the district is listed', () => {
    const result = priced(
      calculateEstimate(
        project({ cityId: 'city_izmir', districtId: 'dst_konak' }),
        book({
          regionAdjustments: [{ cityId: 'city_istanbul', mode: 'FLAT', valueKurus: 10_000_00 }],
        }),
        SETTINGS,
      ),
    )
    expect(result.breakdown.regional.matchedOn).toBeNull()
    expect(result.breakdown.regionalKurus).toBe(0)
  })
})

describe('rules', () => {
  const rules: RuleInput[] = [
    { id: 'area', kind: 'AREA_DISCOUNT', thresholdMin: 10, mode: 'PERCENT', percent: 5 },
    {
      id: 'value',
      kind: 'VALUE_DISCOUNT',
      thresholdMin: 10_000_00,
      mode: 'FLAT',
      valueKurus: 750_00,
    },
    { id: 'size', kind: 'SIZE_SURCHARGE', thresholdMin: 15, mode: 'FLAT', valueKurus: 400_00 },
    { id: 'height', kind: 'HEIGHT_SURCHARGE', thresholdMin: 3, mode: 'PERCENT', percent: 2 },
  ]

  it('subtracts discounts and adds surcharges, all against the subtotal', () => {
    const result = priced(calculateEstimate(project(), book({ rules }), SETTINGS))

    // subtotal ₺20 000 → −5% (₺1 000) − ₺750 + ₺400 + 2% (₺400)
    expect(result.breakdown.rulesKurus).toBe(-1_000_00 - 750_00 + 400_00 + 400_00)
  })

  it('is unaffected by the order the rules arrive in', () => {
    /*
     * The additive design in one assertion. Every permutation of four rules, same net — so a
     * future change that makes one rule read another's output fails here rather than in a
     * manufacturer's invoice.
     */
    const expected = priced(calculateEstimate(project(), book({ rules }), SETTINGS)).netKurus

    for (const permutation of permutations(rules)) {
      const net = priced(
        calculateEstimate(project(), book({ rules: permutation }), SETTINGS),
      ).netKurus
      expect(net, permutation.map((rule) => rule.id).join(',')).toBe(expected)
    }
  })

  it('ignores a rule whose window excludes the project', () => {
    const result = priced(
      calculateEstimate(
        project({ areaM2: 5 }),
        book({
          rules: [
            { id: 'r', kind: 'AREA_DISCOUNT', thresholdMin: 10, mode: 'PERCENT', percent: 5 },
          ],
        }),
        SETTINGS,
      ),
    )
    expect(result.breakdown.rules).toHaveLength(0)
    expect(result.breakdown.rulesKurus).toBe(0)
  })

  it('does not fire a height rule on a project with no height', () => {
    // Absent must not behave as zero: a "surcharge above 3 m" would otherwise apply to every
    // project whose height was never captured.
    const result = priced(
      calculateEstimate(
        project({ heightM: null }),
        book({
          rules: [
            {
              id: 'h',
              kind: 'HEIGHT_SURCHARGE',
              thresholdMin: 0,
              mode: 'FLAT',
              valueKurus: 100_00,
            },
          ],
        }),
        SETTINGS,
      ),
    )
    expect(result.breakdown.rules).toHaveLength(0)
  })

  it('handles an empty rule set', () => {
    const result = priced(calculateEstimate(project(), book({ rules: [] }), SETTINGS))
    expect(result.breakdown.rulesKurus).toBe(0)
    expect(result.netKurus).toBe(20_000_00)
  })
})

describe('rounding', () => {
  it('never produces a fractional kuruş', () => {
    const result = priced(
      calculateEstimate(
        project({ areaM2: 12.37, perimeterM: 14.13, selectedOptionIds: ['a', 'b'] }),
        book({
          item: { basePriceKurus: 833_33, minProjectPriceKurus: 0, setupFeeKurus: 77 },
          optionPrices: [
            { optionId: 'a', mode: 'PER_M', valueKurus: 111_11 },
            { optionId: 'b', mode: 'PERCENT', percent: 7 },
          ],
          rules: [{ id: 'r', kind: 'AREA_DISCOUNT', thresholdMin: 1, mode: 'PERCENT', percent: 3 }],
          regionAdjustments: [{ cityId: 'city_istanbul', mode: 'PERCENT', percent: 13 }],
        }),
        SETTINGS,
      ),
    )

    const numbers = [
      result.netKurus,
      result.bandLowKurus,
      result.bandHighKurus,
      result.breakdown.baseKurus,
      result.breakdown.optionsKurus,
      result.breakdown.subtotalKurus,
      result.breakdown.rulesKurus,
      result.breakdown.regionalKurus,
      ...result.breakdown.options.map((line) => line.amountKurus),
      ...result.breakdown.rules.map((line) => line.amountKurus),
    ]

    numbers.forEach((value) => expect(Number.isInteger(value)).toBe(true))
  })

  it('rounds half away from zero on a discount, not toward it', () => {
    /*
     * The bias `shared/money` exists to prevent, reached through the engine: a −0.5 kuruş
     * intermediate must become −1, not 0. `Math.round(-0.5)` is `-0`, which would round every
     * half-kuruş discount in the platform's favour.
     */
    const result = priced(
      calculateEstimate(
        project({ areaM2: 1 }),
        book({
          item: { basePriceKurus: 1_00, minProjectPriceKurus: 0, setupFeeKurus: 0 },
          // 0.5% of ₺1.00 = 0.5 kuruş, as a discount.
          rules: [
            { id: 'r', kind: 'VALUE_DISCOUNT', thresholdMin: 0, mode: 'PERCENT', percent: 0.5 },
          ],
        }),
        SETTINGS,
      ),
    )
    expect(result.breakdown.rulesKurus).toBe(-1)
  })
})

describe('band', () => {
  it('uses the percentage when it is wider than the minimum', () => {
    const { bandLowKurus, bandHighKurus } = computeBand(100_000_00, {
      bandPercent: 10,
      bandMinKurus: 500_00,
      roundStepKurus: 1,
    })
    // ±5% of ₺100 000 = ₺5 000 each side.
    expect(bandLowKurus).toBe(95_000_00)
    expect(bandHighKurus).toBe(105_000_00)
  })

  it('uses the minimum when the percentage is narrower', () => {
    const { bandLowKurus, bandHighKurus } = computeBand(1_000_00, {
      bandPercent: 10,
      bandMinKurus: 500_00,
      roundStepKurus: 1,
    })
    // 10% of ₺1 000 is ₺100, below the ₺500 floor, so ±₺250.
    expect(bandLowKurus).toBe(750_00)
    expect(bandHighKurus).toBe(1_250_00)
  })

  it('rounds outward to the step, never inward', () => {
    // Outward on both edges, so the true figure is always inside the shown band.
    const { bandLowKurus, bandHighKurus } = computeBand(37_777_00, SETTINGS)
    expect(bandLowKurus % 500_00).toBe(0)
    expect(bandHighKurus % 500_00).toBe(0)
    expect(bandLowKurus).toBeLessThanOrEqual(37_777_00)
    expect(bandHighKurus).toBeGreaterThanOrEqual(37_777_00)
  })

  it('never goes negative', () => {
    const { bandLowKurus, bandHighKurus } = computeBand(100_00, {
      bandPercent: 10,
      bandMinKurus: 10_000_00,
      roundStepKurus: 500_00,
    })
    expect(bandLowKurus).toBe(0)
    expect(bandHighKurus).toBeGreaterThan(0)
  })

  it('is exact when the percentage is zero and there is no minimum', () => {
    const { bandLowKurus, bandHighKurus } = computeBand(12_345_00, {
      bandPercent: 0,
      bandMinKurus: 0,
      roundStepKurus: 1,
    })
    expect(bandLowKurus).toBe(12_345_00)
    expect(bandHighKurus).toBe(12_345_00)
  })
})

describe('failure modes', () => {
  it('returns price-on-request when the product is not in the book', () => {
    const result = calculateEstimate(project(), book({ item: null }), SETTINGS)
    expect(result.status).toBe('price-on-request')
    if (result.status !== 'price-on-request') return
    expect(result.reason).toBe('product-not-in-book')
  })

  it('returns unpriceable when the basis is absent', () => {
    const result = calculateEstimate(project({ areaM2: null }), book(), SETTINGS)
    expect(result.status).toBe('unpriceable')
  })

  it('prices a zero basis at zero rather than refusing it', () => {
    // Zero is a real answer; absent is not. Conflating them turns a free configuration into
    // a precondition failure the customer cannot act on.
    const result = priced(calculateEstimate(project({ areaM2: 0 }), book(), SETTINGS))
    expect(result.breakdown.baseKurus).toBe(0)
    expect(result.netKurus).toBe(0)
  })

  it('contributes zero for an option with no price row, and says so', () => {
    const result = priced(
      calculateEstimate(
        project({ selectedOptionIds: ['priced', 'orphan'] }),
        book({ optionPrices: [{ optionId: 'priced', mode: 'FLAT', valueKurus: 100_00 }] }),
        SETTINGS,
      ),
    )
    expect(result.incomplete).toBe(true)
    expect(result.breakdown.unpricedOptionIds).toEqual(['orphan'])
    expect(result.breakdown.optionsKurus).toBe(100_00)
  })

  it('stamps the engine version on every outcome', () => {
    expect(calculateEstimate(project(), book(), SETTINGS).engineVersion).toBe(ENGINE_VERSION)
    expect(calculateEstimate(project(), book({ item: null }), SETTINGS).engineVersion).toBe(
      ENGINE_VERSION,
    )
    expect(calculateEstimate(project({ areaM2: null }), book(), SETTINGS).engineVersion).toBe(
      ENGINE_VERSION,
    )
  })
})

describe('properties', () => {
  it('net is monotonic in area', () => {
    /*
     * `20` §Unit asks for this by name, and it is an **arithmetic** property only for a
     * rule-free book: base, options and a regional percentage all scale or stay flat, so more
     * area is never less money.
     *
     * With threshold rules it is not universally true and is not meant to be — a volume
     * discount can invert the total at its boundary. That is a property of a *price book*
     * rather than of the engine, so it is checked by `inspectPriceBook` and reported to the
     * manufacturer. See `diagnostics.test.ts`.
     */
    const priceBook = book({
      item: { basePriceKurus: 1_234_00, minProjectPriceKurus: 5_000_00, setupFeeKurus: 900_00 },
      optionPrices: [
        { optionId: 'a', mode: 'PER_M2', valueKurus: 45_00 },
        { optionId: 'b', mode: 'FLAT', valueKurus: 1_000_00 },
        { optionId: 'c', mode: 'PERCENT', percent: 8 },
      ],
      regionAdjustments: [{ cityId: 'city_istanbul', mode: 'PERCENT', percent: 12 }],
    })

    let previous = -1
    for (let areaM2 = 0; areaM2 <= 300; areaM2 += 0.5) {
      const result = priced(
        calculateEstimate(
          project({ areaM2, selectedOptionIds: ['a', 'b', 'c'] }),
          priceBook,
          SETTINGS,
        ),
      )
      expect(result.netKurus, `area ${areaM2}`).toBeGreaterThanOrEqual(previous)
      previous = result.netKurus
    }
  })

  it('the band always contains the net', () => {
    // Universally true, including under the floor, the minimum width and the rounding step.
    const settings = [
      SETTINGS,
      { bandPercent: 0, bandMinKurus: 0, roundStepKurus: 1 },
      { bandPercent: 50, bandMinKurus: 0, roundStepKurus: 1_000_00 },
      { bandPercent: 3, bandMinKurus: 25_000_00, roundStepKurus: 100 },
    ]

    for (const setting of settings) {
      for (let areaM2 = 0; areaM2 <= 200; areaM2 += 1) {
        const result = priced(
          calculateEstimate(
            project({ areaM2, selectedOptionIds: ['a'] }),
            book({
              optionPrices: [{ optionId: 'a', mode: 'PER_M2', valueKurus: 33_33 }],
              rules: [
                { id: 'r', kind: 'AREA_DISCOUNT', thresholdMin: 50, mode: 'PERCENT', percent: 7 },
              ],
            }),
            setting,
          ),
        )

        expect(result.bandLowKurus, `low, area ${areaM2}`).toBeLessThanOrEqual(result.netKurus)
        expect(result.bandHighKurus, `high, area ${areaM2}`).toBeGreaterThanOrEqual(result.netKurus)
      }
    }
  })
})

/** Every ordering of a small list. Four rules is 24 permutations — cheap and exhaustive. */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]]
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  )
}
