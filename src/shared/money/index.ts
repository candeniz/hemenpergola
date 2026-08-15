/**
 * Money is integer kuruş, end to end (`ADR-005`, `04-data-model.md` §Conventions).
 * A `Float` or a formatted string carrying money is a defect.
 *
 * Everything here takes and returns whole kuruş. Formatting happens once, at the edge.
 */

/** Kuruş. An integer: 1 TRY = 100. Named for readability, not branded — see the note below. */
export type Kurus = number

/*
 * Why not a branded type: Prisma returns plain `number` for `Int` columns, so a brand would
 * mean a cast at every repository boundary, and a cast is exactly the thing that stops
 * being read after the third one. Instead every function here validates its inputs and
 * guarantees an integer result, and the ban on `Float` money columns is enforced in the
 * schema rather than in the type system.
 */

export class MoneyError extends Error {
  override readonly name = 'MoneyError'
}

function assertKurus(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`${label} must be a finite number, received ${value}`)
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be whole kuruş, received ${value}`)
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} exceeds the safe integer range: ${value}`)
  }
}

/**
 * Round half **away from zero**, which is what `08-pricing-engine.md` §Arithmetic rules
 * requires.
 *
 * `Math.round` rounds half **up** — towards positive infinity — so it disagrees on every
 * negative half: `Math.round(-0.5)` is `-0`, not `-1`. Discounts and adjustments produce
 * negative intermediates (`08` §Algorithm steps 6 and 7), so using `Math.round` would bias
 * every discount by one kuruş in the platform's favour, silently and only on the half
 * boundary. That is the kind of defect that is found by an accountant, not by a test —
 * unless the test exists, which is why `money.test.ts` covers the negative half explicitly.
 */
export function roundHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`Cannot round a non-finite value: ${value}`)
  }

  // Adding 0.5 before flooring re-introduces the same bias, so mirror instead: round the
  // magnitude and restore the sign.
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/** Add. Any number of operands, so a subtotal is one call and therefore one audit point. */
export function addKurus(...amounts: Kurus[]): Kurus {
  amounts.forEach((amount, index) => assertKurus(amount, `amount[${index}]`))
  return amounts.reduce((total, amount) => total + amount, 0)
}

export function subtractKurus(minuend: Kurus, subtrahend: Kurus): Kurus {
  assertKurus(minuend, 'minuend')
  assertKurus(subtrahend, 'subtrahend')
  return minuend - subtrahend
}

/**
 * Multiply kuruş by a real quantity — an area in m², a length, a count — and round once.
 * This is the only place a non-integer legitimately meets money.
 */
export function multiplyKurus(amount: Kurus, factor: number): Kurus {
  assertKurus(amount, 'amount')
  if (!Number.isFinite(factor)) {
    throw new MoneyError(`factor must be a finite number, received ${factor}`)
  }
  return roundHalfAwayFromZero(amount * factor)
}

/**
 * Percentages are carried as integer **basis points** (1% = 100 bp) so a percentage never
 * introduces a second rounding site (`08` §Arithmetic rules). `percentToBasisPoints`
 * converts at the boundary, once.
 */
export function percentToBasisPoints(percent: number): number {
  if (!Number.isFinite(percent)) {
    throw new MoneyError(`percent must be a finite number, received ${percent}`)
  }
  return roundHalfAwayFromZero(percent * 100)
}

/** Apply basis points to an amount: `applyBasisPoints(10_000_00, 2_000)` is 20% of ₺10 000. */
export function applyBasisPoints(amount: Kurus, basisPoints: number): Kurus {
  assertKurus(amount, 'amount')
  if (!Number.isInteger(basisPoints)) {
    throw new MoneyError(`basisPoints must be a whole number, received ${basisPoints}`)
  }
  return roundHalfAwayFromZero((amount * basisPoints) / 10_000)
}

/** The floor a price cannot go below — `PriceBookItem.minProjectPriceKurus` (`08` step 9). */
export function maxKurus(a: Kurus, b: Kurus): Kurus {
  assertKurus(a, 'a')
  assertKurus(b, 'b')
  return a > b ? a : b
}

export function minKurus(a: Kurus, b: Kurus): Kurus {
  assertKurus(a, 'a')
  assertKurus(b, 'b')
  return a < b ? a : b
}

/** Round to a step — the band rounding in `08` §Band computation (`ROUND_STEP`, ₺500). */
export function floorToStep(amount: Kurus, step: Kurus): Kurus {
  assertKurus(amount, 'amount')
  assertKurus(step, 'step')
  if (step <= 0) throw new MoneyError(`step must be positive, received ${step}`)
  return Math.floor(amount / step) * step
}

export function ceilToStep(amount: Kurus, step: Kurus): Kurus {
  assertKurus(amount, 'amount')
  assertKurus(step, 'step')
  if (step <= 0) throw new MoneyError(`step must be positive, received ${step}`)
  return Math.ceil(amount / step) * step
}

/** Kuruş → the major unit, for display and for JSON that a human reads. Never for maths. */
export function kurusToLira(amount: Kurus): number {
  assertKurus(amount, 'amount')
  return amount / 100
}

/** Lira → kuruş, for parsing user input at the edge. */
export function liraToKurus(lira: number): Kurus {
  if (!Number.isFinite(lira)) {
    throw new MoneyError(`lira must be a finite number, received ${lira}`)
  }
  return roundHalfAwayFromZero(lira * 100)
}

/**
 * The only formatter. `07-frontend-architecture.md` §i18n: `Intl.NumberFormat` over
 * kuruş ÷ 100, at the edge only — a formatted string never travels back into a calculation.
 */
export function formatKurus(amount: Kurus, locale: 'tr' | 'en' = 'tr'): string {
  assertKurus(amount, 'amount')

  return new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(kurusToLira(amount))
}
