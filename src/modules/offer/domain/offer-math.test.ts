import { describe, expect, it } from 'vitest'

import { applyBasisPoints, percentToBasisPoints } from '@/shared/money'

import { computeOfferTotals } from './offer-math'

describe('11 §Offers and KDV — tax once, on the net total', () => {
  it('computes tax on the summed net, and stores gross = net + tax', () => {
    const totals = computeOfferTotals(
      [
        {
          description: 'Bioklimatik pergola',
          quantity: 1,
          unit: 'adet',
          unitPriceKurus: 95_000_00,
        },
        { description: 'Montaj', quantity: 1, unit: 'adet', unitPriceKurus: 5_000_00 },
      ],
      20,
    )

    expect(totals.netKurus).toBe(100_000_00)
    expect(totals.taxKurus).toBe(20_000_00)
    expect(totals.grossKurus).toBe(120_000_00)
  })

  it('demonstrates why per-line tax is wrong: the two roundings genuinely diverge', () => {
    /*
     * Three identical lines of 100.01 TL at 18%: per line, 1800.18 kuruş rounds to 1800,
     * summing to 5400; on the net, 30003 × 18% = 5400.54 rounds to 5401. One kuruş apart —
     * and money is integer kuruş (`ADR-005`), so "close" is "different".
     */
    const lines = Array.from({ length: 3 }, (_, i) => ({
      description: `Kalem ${i + 1}`,
      quantity: 1,
      unit: 'adet',
      unitPriceKurus: 100_01,
    }))

    const totals = computeOfferTotals(lines, 18)

    const perLineTax = lines
      .map((line) => applyBasisPoints(line.unitPriceKurus, percentToBasisPoints(18)))
      .reduce((a, b) => a + b, 0)

    expect(totals.netKurus).toBe(300_03)
    expect(totals.taxKurus).toBe(54_01) // once, on the total
    expect(perLineTax).toBe(54_00) // per line — a different number
    expect(totals.taxKurus).not.toBe(perLineTax)
    expect(totals.grossKurus).toBe(totals.netKurus + totals.taxKurus)
  })

  it('rounds each line net once for display, half away from zero', () => {
    const totals = computeOfferTotals(
      [{ description: 'm² işi', quantity: 2.5, unit: 'm²', unitPriceKurus: 333 }],
      20,
    )
    // 333 × 2.5 = 832.5 → 833, once, at the line boundary.
    expect(totals.lines[0]?.lineNetKurus).toBe(833)
    expect(totals.netKurus).toBe(833)
  })
})
