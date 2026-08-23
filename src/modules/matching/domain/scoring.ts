/**
 * The scoring half of matching — `09-manufacturer-matching.md` §Scoring.
 *
 * A **pure function**, like the pricing engine and for the same reasons: no database, no
 * clock read (the caller passes `now`), no randomness. The application service gathers the
 * signals, calls this per candidate, and stores the returned breakdown on `MatchResult`.
 *
 * Seven weighted components, 0–100. Three rules from `09` that are load-bearing and easy to
 * erode:
 *
 *   **Price is not a component.** There is no price field anywhere in `CandidateSignals`,
 *   which makes adding one a visible act rather than a drift. Ranking by price turns the
 *   marketplace into a race to the bottom (`09` §Scoring), and the customer already sees the
 *   band (`ADR-006`).
 *
 *   **Bayesian rating.** `(C·m + Σratings) / (C + n)` with the platform mean as prior and
 *   `C ≈ 5` — a single 5-star review must not outrank fifty 4.8s. With no reviews at all
 *   (every company today: reviews are Phase 7) everyone sits on the prior, which is the
 *   *designed* cold-start behaviour, not a placeholder.
 *
 *   **New companies are not buried.** A verified company with no history gets the prior and
 *   a bounded newcomer allowance for its first 30 days — otherwise no new manufacturer can
 *   ever get a first lead.
 *
 * ## Q22 — proximity is scored in bands, not continuously
 *
 * The distance under the score is centroid-grade on both ends (`ADR-019`): the project point
 * is usually a district centroid, and a radius centre may be one too. A continuous function
 * of that number moves the *ranking* on error the data cannot support. Bands absorb
 * centroid-grade error: two companies 3 km apart through district centroids land in the same
 * band instead of one outranking the other on noise. The banded default is what Q22's row in
 * `25-progress.md` prescribes, together with `ServiceArea.precision` arriving in migration 7.
 */

export type MatchWeights = {
  version: number
  /** Out of 100, `09` §Scoring's table. */
  proximity: number
  capability: number
  rating: number
  responsiveness: number
  history: number
  portfolio: number
  freshness: number
}

/** `09` §Scoring's published table — the fallback when no `PlatformSetting` row exists. */
export const DEFAULT_WEIGHTS: MatchWeights = {
  version: 1,
  proximity: 25,
  capability: 20,
  rating: 20,
  responsiveness: 15,
  history: 10,
  portfolio: 5,
  freshness: 5,
}

/** The Bayesian prior's pseudo-count — `09` §Scoring names `C ≈ 5`. */
export const BAYESIAN_C = 5

/** The bounded newcomer allowance, in score points, for the first 30 days after verification. */
export const NEWCOMER_BONUS = 5
export const NEWCOMER_WINDOW_DAYS = 30

/**
 * Everything the score reads about one candidate. Deliberately **not** a Prisma type, and
 * deliberately **price-free** — see the file comment.
 */
export type CandidateSignals = {
  companyId: string
  /** Kilometres, company ↔ project. Null when neither end is located. */
  distanceKm: number | null
  /** The tightest matched RADIUS area's radius. Null when the match was CITY/DISTRICT. */
  radiusKm: number | null
  /** Of the project's selected options, how many the company offers. */
  selectedOptionCount: number
  offeredOptionCount: number
  /** `avg(Review.ratingOverall)` inputs. Zero reviews is the norm until Phase 7. */
  ratingSum: number
  ratingCount: number
  /** Median accept/decline minutes over 90 days. Null until `OfferRequest` exists (Phase 6). */
  medianResponseMinutes: number | null
  /** Completed engagements. Zero until Phase 6. */
  completedEngagements: number
  /** Portfolio items for this product. */
  portfolioCount: number
  /** When the published price book went live. Null without one. */
  priceBookPublishedAt: Date | null
  /** Profile recency. */
  profileUpdatedAt: Date | null
  verifiedAt: Date | null
}

export type ComponentScore = {
  /** The signal the component read, as a number a human can check. */
  raw: number | null
  /** 0–1. */
  normalised: number
  weight: number
  /** `normalised × weight`, the points contributed. */
  weighted: number
}

export type ScoreBreakdown = {
  weightsVersion: number
  components: {
    proximity: ComponentScore
    capability: ComponentScore
    rating: ComponentScore
    responsiveness: ComponentScore
    history: ComponentScore
    portfolio: ComponentScore
    freshness: ComponentScore
  }
  newcomerBonus: number
  /** Q22: the accuracy of the two ends of the proximity comparison, for explainability. */
  proximityBand: string
  total: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Q22's bands. Two scales, because the meaningful denominator differs:
 *
 *   RADIUS match  → the ratio distance/radius. The manufacturer said "within N km"; a
 *                   quarter of that promise is close, all of it is the edge.
 *   CITY/DISTRICT → absolute bands. There is no radius to normalise over, and `09`'s
 *                   "normalised over the service radius" has nothing to divide by — so the
 *                   bands step at distances that matter at Turkish province scale.
 *   no distance   → 0.5, the neutral middle. Unknown is not far and it is not near, and
 *                   inventing either would rank companies on a number nobody measured.
 */
export function proximityBand(
  distanceKm: number | null,
  radiusKm: number | null,
): { normalised: number; band: string } {
  if (distanceKm === null) return { normalised: 0.5, band: 'unknown' }

  if (radiusKm !== null && radiusKm > 0) {
    const ratio = distanceKm / radiusKm
    if (ratio <= 0.25) return { normalised: 1, band: 'radius-inner-quarter' }
    if (ratio <= 0.5) return { normalised: 0.8, band: 'radius-inner-half' }
    if (ratio <= 0.75) return { normalised: 0.6, band: 'radius-outer-half' }
    return { normalised: 0.4, band: 'radius-edge' }
  }

  if (distanceKm <= 10) return { normalised: 1, band: 'under-10km' }
  if (distanceKm <= 25) return { normalised: 0.8, band: 'under-25km' }
  if (distanceKm <= 50) return { normalised: 0.6, band: 'under-50km' }
  if (distanceKm <= 100) return { normalised: 0.4, band: 'under-100km' }
  return { normalised: 0.2, band: 'over-100km' }
}

/** `(C·m + Σratings) / (C + n)`, normalised to 0–1 over a 5-star scale. */
export function bayesianRating(
  ratingSum: number,
  ratingCount: number,
  platformMean: number,
): number {
  const smoothed = (BAYESIAN_C * platformMean + ratingSum) / (BAYESIAN_C + ratingCount)
  return Math.min(Math.max(smoothed / 5, 0), 1)
}

/** Responsiveness: 2 h is excellent, 48 h (the SLA window, Q7) is the floor of usable. */
function responsivenessScore(medianMinutes: number | null): number {
  if (medianMinutes === null) return 0.5 // no history yet — neutral, same as unknown distance
  if (medianMinutes <= 120) return 1
  if (medianMinutes <= 480) return 0.8
  if (medianMinutes <= 1440) return 0.6
  if (medianMinutes <= 2880) return 0.4
  return 0.2
}

/** Completed engagements, log-scaled (`09`): 0 → 0, ~50 → 1. */
function historyScore(completed: number): number {
  if (completed <= 0) return 0
  return Math.min(Math.log1p(completed) / Math.log1p(50), 1)
}

/** Portfolio depth: five items for this product is full marks (`09` gives it 5/100). */
function portfolioScore(count: number): number {
  return Math.min(Math.max(count, 0) / 5, 1)
}

function recencyBand(date: Date | null, now: Date): number {
  if (date === null) return 0
  const days = (now.getTime() - date.getTime()) / DAY_MS
  if (days <= 30) return 1
  if (days <= 90) return 0.75
  if (days <= 180) return 0.5
  if (days <= 365) return 0.25
  return 0.1
}

export type ScoringContext = {
  weights: MatchWeights
  /** The Bayesian prior `m` — the platform mean rating, an admin-tunable setting. */
  platformMeanRating: number
  now: Date
}

export function scoreCandidate(
  signals: CandidateSignals,
  context: ScoringContext,
): { score: number; breakdown: ScoreBreakdown } {
  const { weights, now } = context

  const proximity = proximityBand(signals.distanceKm, signals.radiusKm)

  // No options selected means nothing to fail at: capability is vacuously full, not zero —
  // zero would bury every company on projects that happen to have no options.
  const capabilityRatio =
    signals.selectedOptionCount <= 0
      ? 1
      : Math.min(signals.offeredOptionCount / signals.selectedOptionCount, 1)

  const rating = bayesianRating(signals.ratingSum, signals.ratingCount, context.platformMeanRating)
  const responsiveness = responsivenessScore(signals.medianResponseMinutes)
  const history = historyScore(signals.completedEngagements)
  const portfolio = portfolioScore(signals.portfolioCount)

  // `09`: "price book and profile recency" — both halves, equally.
  const freshness =
    0.5 * recencyBand(signals.priceBookPublishedAt, now) +
    0.5 * recencyBand(signals.profileUpdatedAt, now)

  const component = (raw: number | null, normalised: number, weight: number): ComponentScore => ({
    raw,
    normalised,
    weight,
    weighted: normalised * weight,
  })

  const components = {
    proximity: component(signals.distanceKm, proximity.normalised, weights.proximity),
    capability: component(capabilityRatio, capabilityRatio, weights.capability),
    rating: component(rating, rating, weights.rating),
    responsiveness: component(
      signals.medianResponseMinutes,
      responsiveness,
      weights.responsiveness,
    ),
    history: component(signals.completedEngagements, history, weights.history),
    portfolio: component(signals.portfolioCount, portfolio, weights.portfolio),
    freshness: component(null, freshness, weights.freshness),
  }

  const isNewcomer =
    signals.verifiedAt !== null &&
    now.getTime() - signals.verifiedAt.getTime() <= NEWCOMER_WINDOW_DAYS * DAY_MS

  const newcomerBonus = isNewcomer ? NEWCOMER_BONUS : 0

  const weightedSum = Object.values(components).reduce((sum, part) => sum + part.weighted, 0)
  const total = Math.min(weightedSum + newcomerBonus, 100)

  return {
    score: total,
    breakdown: {
      weightsVersion: weights.version,
      components,
      newcomerBonus,
      proximityBand: proximity.band,
      total,
    },
  }
}
