import { describe, expect, it } from 'vitest'

import {
  addKurus,
  applyBasisPoints,
  ceilToStep,
  floorToStep,
  formatKurus,
  kurusToLira,
  liraToKurus,
  maxKurus,
  minKurus,
  MoneyError,
  multiplyKurus,
  percentToBasisPoints,
  roundHalfAwayFromZero,
  subtractKurus,
} from './index'

describe('roundHalfAwayFromZero', () => {
  it('rounds positive halves up', () => {
    expect(roundHalfAwayFromZero(0.5)).toBe(1)
    expect(roundHalfAwayFromZero(1.5)).toBe(2)
    expect(roundHalfAwayFromZero(2.5)).toBe(3)
  })

  it('rounds negative halves away from zero, where Math.round does not', () => {
    // The whole reason this function exists. Math.round(-0.5) is -0, Math.round(-1.5) is -1:
    // it rounds towards +∞, so every negative half is biased by one kuruş.
    expect(Math.round(-0.5)).toBe(-0)
    expect(Math.round(-1.5)).toBe(-1)
    expect(Math.round(-2.5)).toBe(-2)

    expect(roundHalfAwayFromZero(-0.5)).toBe(-1)
    expect(roundHalfAwayFromZero(-1.5)).toBe(-2)
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3)
  })

  it('is symmetric about zero for every half', () => {
    for (let n = 0; n < 50; n += 1) {
      const half = n + 0.5
      expect(roundHalfAwayFromZero(-half)).toBe(-roundHalfAwayFromZero(half))
    }
  })

  it('leaves whole numbers alone, including negative zero', () => {
    expect(roundHalfAwayFromZero(0)).toBe(0)
    expect(roundHalfAwayFromZero(-0)).toBe(-0)
    expect(roundHalfAwayFromZero(7)).toBe(7)
    expect(roundHalfAwayFromZero(-7)).toBe(-7)
  })

  it('rejects non-finite input rather than producing NaN kuruş', () => {
    expect(() => roundHalfAwayFromZero(Number.NaN)).toThrowError(MoneyError)
    expect(() => roundHalfAwayFromZero(Number.POSITIVE_INFINITY)).toThrowError(MoneyError)
  })
})

describe('arithmetic', () => {
  it('adds and subtracts', () => {
    expect(addKurus(100, 250, 50)).toBe(400)
    expect(addKurus()).toBe(0)
    expect(subtractKurus(1000, 250)).toBe(750)
    // A discount can legitimately take an intermediate negative.
    expect(subtractKurus(250, 1000)).toBe(-750)
  })

  it('multiplies by a real quantity and rounds once', () => {
    // 20 m² at ₺1 234,56/m²
    expect(multiplyKurus(123_456, 20)).toBe(2_469_120)
    // 14.4 m² — the area the wizard derives from 4800 × 3000 mm
    expect(multiplyKurus(123_456, 14.4)).toBe(1_777_766) // 1 777 766.4 → 1 777 766
    expect(multiplyKurus(-100, 0.5)).toBe(-50)
    // Negative half again, through the multiply path
    expect(multiplyKurus(-1, 0.5)).toBe(-1)
  })

  it('refuses money that is not whole kuruş', () => {
    expect(() => addKurus(10.5, 1)).toThrowError(/whole kuruş/)
    expect(() => multiplyKurus(10.5, 2)).toThrowError(/whole kuruş/)
  })

  it('refuses unsafe integers rather than losing precision silently', () => {
    expect(() => addKurus(Number.MAX_SAFE_INTEGER + 2, 0)).toThrowError(MoneyError)
  })
})

describe('basis points', () => {
  it('converts percent to basis points at the boundary, once', () => {
    expect(percentToBasisPoints(20)).toBe(2_000)
    expect(percentToBasisPoints(2.5)).toBe(250)
    expect(percentToBasisPoints(-10)).toBe(-1_000)
  })

  it('applies basis points with a single rounding step', () => {
    // KDV at 20% on ₺10 000,00
    expect(applyBasisPoints(1_000_000, 2_000)).toBe(200_000)
    // A 12.5% regional adjustment on ₺1 234,56
    expect(applyBasisPoints(123_456, 1_250)).toBe(15_432)
    // A negative adjustment rounds away from zero too
    expect(applyBasisPoints(-1, 5_000)).toBe(-1)
    expect(applyBasisPoints(1, 5_000)).toBe(1)
  })

  it('rejects fractional basis points, which would mean a second rounding site', () => {
    expect(() => applyBasisPoints(100, 12.5)).toThrowError(/whole number/)
  })
})

describe('bounds and steps', () => {
  it('applies a floor and a ceiling', () => {
    expect(maxKurus(150_000, 200_000)).toBe(200_000)
    expect(minKurus(150_000, 200_000)).toBe(150_000)
  })

  it('rounds to a step, which is how the estimate band is built', () => {
    const step = 50_000 // ₺500, the default ROUND_STEP in 08 §Band computation
    expect(floorToStep(1_777_766, step)).toBe(1_750_000)
    expect(ceilToStep(1_777_766, step)).toBe(1_800_000)
    expect(floorToStep(1_800_000, step)).toBe(1_800_000)
    expect(ceilToStep(1_800_000, step)).toBe(1_800_000)
  })

  it('rejects a non-positive step', () => {
    expect(() => floorToStep(100, 0)).toThrowError(/positive/)
    expect(() => ceilToStep(100, -5)).toThrowError(/positive/)
  })
})

describe('edges', () => {
  it('converts to and from the major unit', () => {
    expect(kurusToLira(123_456)).toBe(1234.56)
    expect(liraToKurus(1234.56)).toBe(123_456)
    // Float input that cannot be represented exactly still lands on whole kuruş.
    expect(liraToKurus(0.1 + 0.2)).toBe(30)
  })

  it('formats in Turkish by default', () => {
    const formatted = formatKurus(1_777_766)
    // Turkish uses `.` for thousands and `,` for decimals, with the symbol trailing.
    expect(formatted).toContain('₺')
    expect(formatted).toContain(',')
    expect(formatted.replace(/\s/g, '')).toMatch(/17\.777,66/)
  })

  it('formats negative amounts without losing the sign', () => {
    expect(formatKurus(-50_000)).toMatch(/-|−/)
  })

  it('refuses to format anything that is not whole kuruş', () => {
    expect(() => formatKurus(12.5)).toThrowError(MoneyError)
  })
})
