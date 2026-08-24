import 'server-only'

import { prisma } from '@/shared/db'

/**
 * `company.analytics_refresh` — task 7.3, `16` §Aggregates. Recomputes `Company`'s
 * denormalised numbers **from source**, in one transaction.
 *
 * These are not decoration: `09`'s Bayesian rating component and the responsiveness
 * component read them, so a wrong aggregate silently reorders matching — Q22's "a wrong
 * order is invisible from outside" worry, this time caused by data. Two properties defend
 * against that:
 *
 *   **Recompute, never increment.** The job derives every number from the source tables
 *   each run. An incremental "+1 on publish" corrupts on the first replay; a recompute is
 *   idempotent by construction (the worker rule) and self-heals any historical drift.
 *
 *   **The equality test.** `analytics.integration.test.ts` recomputes the same numbers
 *   independently in the test and asserts the columns match — the only real protection a
 *   denormalised field has.
 *
 * What counts:
 *   ratingSum / reviewCount   PUBLISHED, undeleted reviews only — a PENDING or REJECTED
 *                             review never moves an average (`16` §Moderation)
 *   medianResponseMinutes     accept/decline latency over the last 90 days
 *   completedEngagements      requests that reached `SURVEY_COMPLETED` or later (`09`)
 *
 * A company with no published reviews keeps sum=0/count=0, which the scorer maps onto the
 * Bayesian prior — Phase 5's newcomer treatment is unchanged.
 */

/** The request states that count as a completed engagement (`09` §History). */
const COMPLETED_STATES = [
  'SURVEY_COMPLETED',
  'OFFER_SENT',
  'OFFER_ACCEPTED',
  'OFFER_REJECTED',
  'WON',
  'LOST',
] as const

const RESPONSE_WINDOW_DAYS = 90

export type AnalyticsOutcome = {
  status: 'refreshed' | 'not-found'
  ratingSum?: number
  reviewCount?: number
  medianResponseMinutes?: number | null
  completedEngagements?: number
}

export async function runAnalyticsRefresh(companyId: string): Promise<AnalyticsOutcome> {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: companyId }, select: { id: true } })
    if (company === null) return { status: 'not-found' as const }

    const ratings = await tx.review.aggregate({
      where: { companyId, status: 'PUBLISHED', deletedAt: null },
      _sum: { ratingOverall: true },
      _count: { _all: true },
    })
    const ratingSum = ratings._sum.ratingOverall ?? 0
    const reviewCount = ratings._count._all

    const windowStart = new Date(Date.now() - RESPONSE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const medianRows = await tx.$queryRaw<{ median: number | null }[]>`
      SELECT percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM ("respondedAt" - "createdAt")) / 60
      ) AS median
      FROM "OfferRequest"
      WHERE "companyId" = ${companyId}
        AND "respondedAt" IS NOT NULL
        AND "createdAt" >= ${windowStart}
    `
    const medianRaw = medianRows[0]?.median ?? null
    const medianResponseMinutes = medianRaw === null ? null : Math.round(Number(medianRaw))

    const completedEngagements = await tx.offerRequest.count({
      where: { companyId, status: { in: [...COMPLETED_STATES] } },
    })

    await tx.company.update({
      where: { id: companyId },
      data: {
        ratingSum,
        reviewCount,
        medianResponseMinutes,
        completedEngagements,
        analyticsRefreshedAt: new Date(),
      },
    })

    return {
      status: 'refreshed' as const,
      ratingSum,
      reviewCount,
      medianResponseMinutes,
      completedEngagements,
    }
  })
}
