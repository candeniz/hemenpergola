import { addKurus, applyBasisPoints, multiplyKurus, percentToBasisPoints } from '@/shared/money'

/**
 * Offer arithmetic — `11` §Offers and KDV, pure.
 *
 * The one rule that earns this file: **tax is computed once, on the net total, never per
 * line.** Per-line tax rounds each line to a whole kuruş and then sums the roundings; the
 * legal amount rounds once. The two disagree by up to a kuruş per line, money is integer
 * kuruş (`ADR-005`), and an invoice that disagrees with itself by three kuruş is a support
 * ticket with an auditor attached. `offer-math.test.ts` demonstrates the divergence rather
 * than asserting it away.
 */

export type OfferLineInput = {
  description: string
  quantity: number
  unit: string
  unitPriceKurus: number
}

export type OfferTotals = {
  lines: (OfferLineInput & { lineNetKurus: number })[]
  netKurus: number
  taxRate: number
  taxKurus: number
  grossKurus: number
}

export function computeOfferTotals(lines: OfferLineInput[], taxRate: number): OfferTotals {
  const priced = lines.map((line) => ({
    ...line,
    // One rounding site per line, half away from zero (`shared/money`), for the line's own
    // display — the tax below never reads these individually.
    lineNetKurus: multiplyKurus(line.unitPriceKurus, line.quantity),
  }))

  const netKurus = addKurus(...priced.map((line) => line.lineNetKurus))
  // ONCE, on the net total.
  const taxKurus = applyBasisPoints(netKurus, percentToBasisPoints(taxRate))
  const grossKurus = netKurus + taxKurus

  return { lines: priced, netKurus, taxRate, taxKurus, grossKurus }
}
