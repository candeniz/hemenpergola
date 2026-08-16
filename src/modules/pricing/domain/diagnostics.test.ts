import { describe, expect, it } from 'vitest'

import { inspectPriceBook } from './diagnostics'
import {
  calculateEstimate,
  type BandSettings,
  type PriceBookInput,
  type ProjectInput,
} from './engine'

/**
 * The price-book warnings — see `diagnostics.ts` for why monotonicity is checked here rather
 * than asserted as a property of the engine.
 */

const SETTINGS: BandSettings = { bandPercent: 10, bandMinKurus: 500_00, roundStepKurus: 500_00 }

const PROJECT: ProjectInput = {
  productId: 'prd',
  basisType: 'AREA_M2',
  areaM2: 20,
  perimeterM: 18,
  heightM: 3,
  quantity: 1,
  selectedOptionIds: [],
  cityId: 'city',
  districtId: 'dst',
}

function book(overrides: Partial<PriceBookInput> = {}): PriceBookInput {
  return {
    version: 1,
    item: { basePriceKurus: 100_00, minProjectPriceKurus: 0, setupFeeKurus: 0 },
    optionPrices: [],
    regionAdjustments: [],
    rules: [],
    ...overrides,
  }
}

describe('monotonicity', () => {
  it('reports a threshold discount that makes a bigger project cheaper', () => {
    /*
     * The exact case from the module docstring, and the reason `20` §Unit's monotonicity
     * property is scoped to rule-free books: ₺100/m² with 10% off at 100 m² means 99 m² costs
     * ₺9 900 and 100 m² costs ₺9 000. The engine is doing what it was told; the manufacturer
     * almost certainly did not mean it.
     */
    const priceBook = book({
      rules: [{ id: 'r', kind: 'AREA_DISCOUNT', thresholdMin: 100, mode: 'PERCENT', percent: 10 }],
    })

    const at99 = calculateEstimate({ ...PROJECT, areaM2: 99 }, priceBook, SETTINGS)
    const at100 = calculateEstimate({ ...PROJECT, areaM2: 100 }, priceBook, SETTINGS)
    if (at99.status !== 'priced' || at100.status !== 'priced') throw new Error('expected priced')
    expect(at100.netKurus).toBeLessThan(at99.netKurus)

    const warnings = inspectPriceBook(PROJECT, priceBook, SETTINGS)
    const inversion = warnings.find((warning) => warning.kind === 'non-monotonic-in-basis')

    expect(inversion).toBeDefined()
    if (inversion?.kind !== 'non-monotonic-in-basis') return
    expect(inversion.atBasis).toBe(100)
    expect(inversion.previousBasis).toBe(99)
  })

  it('stays quiet on a discount small enough not to invert the total', () => {
    // A 1% discount at 100 m² still leaves 100 m² dearer than 99 m². The warning is about the
    // inversion, not about discounts.
    const warnings = inspectPriceBook(
      PROJECT,
      book({
        rules: [{ id: 'r', kind: 'AREA_DISCOUNT', thresholdMin: 100, mode: 'PERCENT', percent: 1 }],
      }),
      SETTINGS,
    )
    expect(warnings.filter((warning) => warning.kind === 'non-monotonic-in-basis')).toHaveLength(0)
  })

  it('stays quiet on a rule-free book', () => {
    expect(inspectPriceBook(PROJECT, book(), SETTINGS)).toHaveLength(0)
  })
})

describe('other warnings', () => {
  it('reports a rule that never fires', () => {
    // Nearly always a unit mix-up — a ₺40 000 threshold typed as 40 000 kuruş, or metres as
    // centimetres. Silent until a manufacturer asks why their discount never appears.
    const warnings = inspectPriceBook(
      PROJECT,
      book({
        rules: [
          {
            id: 'never',
            kind: 'AREA_DISCOUNT',
            thresholdMin: 100_000,
            mode: 'PERCENT',
            percent: 5,
          },
        ],
      }),
      SETTINGS,
    )
    expect(warnings.some((warning) => warning.kind === 'rule-never-fires')).toBe(true)
  })

  it('reports a floor that swallows the whole range', () => {
    // Every probe lands on the minimum, so the base price is decorative and every project
    // quotes the same number.
    const warnings = inspectPriceBook(
      PROJECT,
      book({ item: { basePriceKurus: 1_00, minProjectPriceKurus: 500_000_00, setupFeeKurus: 0 } }),
      SETTINGS,
    )
    expect(warnings.some((warning) => warning.kind === 'floor-dominates')).toBe(true)
  })

  it('says nothing about a book with no item', () => {
    expect(inspectPriceBook(PROJECT, book({ item: null }), SETTINGS)).toHaveLength(0)
  })
})
