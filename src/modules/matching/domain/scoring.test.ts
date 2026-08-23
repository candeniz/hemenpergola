import { describe, expect, it } from 'vitest'

import {
  BAYESIAN_C,
  bayesianRating,
  DEFAULT_WEIGHTS,
  NEWCOMER_BONUS,
  proximityBand,
  scoreCandidate,
  type CandidateSignals,
  type ScoringContext,
} from './scoring'

/**
 * `09-manufacturer-matching.md` §Scoring. The rules asserted here are the ones the doc
 * writes in bold, because they are the ones a later refactor erodes first.
 */

const NOW = new Date('2026-08-23T12:00:00Z')

function signals(overrides: Partial<CandidateSignals> = {}): CandidateSignals {
  return {
    companyId: 'cmp_test',
    distanceKm: 10,
    radiusKm: null,
    selectedOptionCount: 0,
    offeredOptionCount: 0,
    ratingSum: 0,
    ratingCount: 0,
    medianResponseMinutes: null,
    completedEngagements: 0,
    portfolioCount: 0,
    priceBookPublishedAt: null,
    profileUpdatedAt: null,
    verifiedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

function context(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return { weights: DEFAULT_WEIGHTS, platformMeanRating: 4.2, now: NOW, ...overrides }
}

describe('the seven weighted components', () => {
  it('publishes exactly the table from 09 §Scoring, summing to 100', () => {
    const { version: _version, ...components } = DEFAULT_WEIGHTS

    expect(components).toEqual({
      proximity: 25,
      capability: 20,
      rating: 20,
      responsiveness: 15,
      history: 10,
      portfolio: 5,
      freshness: 5,
    })
    expect(Object.values(components).reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('breaks a score down into exactly those seven components — price is not one of them', () => {
    /*
     * `09` §Scoring: *"Price is not in the score."* The breakdown's component set is the
     * complete list, so a price component cannot arrive without failing here — and
     * `CandidateSignals` carries no price field to compute one from.
     */
    const { breakdown } = scoreCandidate(signals(), context())

    expect(Object.keys(breakdown.components).sort()).toEqual([
      'capability',
      'freshness',
      'history',
      'portfolio',
      'proximity',
      'rating',
      'responsiveness',
    ])
  })

  it('never exceeds 100, even with the newcomer bonus on a perfect candidate', () => {
    const perfect = signals({
      distanceKm: 1,
      radiusKm: 50,
      selectedOptionCount: 3,
      offeredOptionCount: 3,
      ratingSum: 250,
      ratingCount: 50,
      medianResponseMinutes: 30,
      completedEngagements: 100,
      portfolioCount: 10,
      priceBookPublishedAt: NOW,
      profileUpdatedAt: NOW,
      verifiedAt: NOW,
    })

    const { score } = scoreCandidate(perfect, context())
    expect(score).toBeLessThanOrEqual(100)
  })
})

describe('Bayesian rating (09: a single 5-star must not outrank fifty 4.8s)', () => {
  it('ranks fifty 4.8s above one 5.0', () => {
    const one = bayesianRating(5, 1, 4.2)
    const fifty = bayesianRating(4.8 * 50, 50, 4.2)

    expect(fifty).toBeGreaterThan(one)
  })

  it('gives a company with no reviews the prior, not zero', () => {
    expect(bayesianRating(0, 0, 4.2)).toBeCloseTo(4.2 / 5)
  })

  it('uses C ≈ 5 as the doc says', () => {
    expect(BAYESIAN_C).toBe(5)
  })
})

describe('newcomer allowance (09: new companies are not buried)', () => {
  it('adds a bounded bonus inside the 30-day window and nothing outside it', () => {
    const fresh = scoreCandidate(
      signals({ verifiedAt: new Date('2026-08-10T00:00:00Z') }),
      context(),
    )
    const old = scoreCandidate(signals({ verifiedAt: new Date('2026-05-01T00:00:00Z') }), context())

    expect(fresh.breakdown.newcomerBonus).toBe(NEWCOMER_BONUS)
    expect(old.breakdown.newcomerBonus).toBe(0)
    expect(fresh.score - old.score).toBeCloseTo(NEWCOMER_BONUS)
  })
})

describe('proximity is banded, not continuous — Q22', () => {
  it('normalises over the radius when one matched', () => {
    expect(proximityBand(10, 50).normalised).toBe(1) // 20% of the promise
    expect(proximityBand(20, 50).normalised).toBe(0.8)
    expect(proximityBand(45, 50).normalised).toBe(0.4) // the edge
  })

  it('uses absolute bands when the match was CITY or DISTRICT', () => {
    expect(proximityBand(5, null).normalised).toBe(1)
    expect(proximityBand(40, null).normalised).toBe(0.6)
    expect(proximityBand(150, null).normalised).toBe(0.2)
  })

  it('treats centroid-grade error as one band, which is the point of banding', () => {
    // Two companies 3 km apart through district centroids: same band, no reorder on noise.
    expect(proximityBand(31, null)).toEqual(proximityBand(34, null))
  })

  it('scores unknown distance as the neutral middle, not near and not far', () => {
    expect(proximityBand(null, null).normalised).toBe(0.5)
  })
})

describe('determinism', () => {
  it('produces identical output for identical input', () => {
    const a = scoreCandidate(signals({ portfolioCount: 3 }), context())
    const b = scoreCandidate(signals({ portfolioCount: 3 }), context())

    expect(a).toEqual(b)
  })
})

describe('capability', () => {
  it('is the offered share of selected options', () => {
    const half = scoreCandidate(
      signals({ selectedOptionCount: 4, offeredOptionCount: 2 }),
      context(),
    )
    expect(half.breakdown.components.capability.normalised).toBe(0.5)
  })

  it('is vacuously full when the project selected no options', () => {
    const none = scoreCandidate(
      signals({ selectedOptionCount: 0, offeredOptionCount: 0 }),
      context(),
    )
    expect(none.breakdown.components.capability.normalised).toBe(1)
  })
})
