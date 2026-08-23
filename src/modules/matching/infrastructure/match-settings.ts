import 'server-only'

import { prisma } from '@/shared/db'

import { DEFAULT_WEIGHTS, type MatchWeights } from '../domain/scoring'

/**
 * Reads the scoring weights — `09-manufacturer-matching.md` §Scoring, `ADM-06`.
 *
 * Same shape and same reasoning as `pricing/infrastructure/band-settings.ts`: an impure edge
 * in `infrastructure/` (no `ActorContext`, no permission, no `Result`, so not a use case),
 * feeding a pure function that takes the values as an argument.
 *
 * One JSON row rather than seven scalar rows, because the weights are only meaningful as a
 * set — an admin editing `proximity` without seeing the other six is how the total stops
 * being 100. `version` is part of the value and is stored on `MatchRun.weightsVersion`, so a
 * ranking can be explained after the weights change (`09` §Scoring).
 *
 * **Defaults matter** — `09`'s published table is the fallback, so a database with no
 * setting row still matches. An absent setting must not mean "no results".
 */

const WEIGHTS_KEY = 'matching.weights'
const MEAN_RATING_KEY = 'matching.platform_mean_rating'

/** The Bayesian prior `m` before any review exists (reviews are Phase 7). */
const DEFAULT_PLATFORM_MEAN_RATING = 4.2

function isValidWeights(value: unknown): value is MatchWeights {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return [
    'version',
    'proximity',
    'capability',
    'rating',
    'responsiveness',
    'history',
    'portfolio',
    'freshness',
  ].every((key) => typeof record[key] === 'number' && Number.isFinite(record[key]))
}

export async function matchWeights(): Promise<MatchWeights> {
  const row = await prisma.platformSetting.findUnique({ where: { key: WEIGHTS_KEY } })
  // A malformed row is treated as absent rather than as zeroes — zero weights would rank
  // every company identically and look like a scoring bug rather than a bad setting.
  return row !== null && isValidWeights(row.value) ? row.value : DEFAULT_WEIGHTS
}

export async function platformMeanRating(): Promise<number> {
  const row = await prisma.platformSetting.findUnique({ where: { key: MEAN_RATING_KEY } })
  const value = row?.value
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 5
    ? value
    : DEFAULT_PLATFORM_MEAN_RATING
}
