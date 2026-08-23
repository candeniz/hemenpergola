import 'server-only'

import { z } from 'zod'

import type { ActorContext } from '@/shared/context/actor'
import { prisma } from '@/shared/db'
import { eligibleCompaniesForProject } from '@/shared/geo'
import { err, notFound, ok, precondition } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

import { calculateEstimate, type ProjectInput } from '@/modules/pricing/domain/engine'
import { bandSettings } from '@/modules/pricing/infrastructure/band-settings'

import { scoreCandidate, type CandidateSignals, type ScoreBreakdown } from '../domain/scoring'
import { matchWeights, platformMeanRating } from '../infrastructure/match-settings'

/**
 * The match pipeline — tasks 5.1–5.5, `09-manufacturer-matching.md` §Pipeline:
 *
 *   eligibility (one SQL) → scoring (pure) → pricing pass → ranking → MatchRun + results
 *
 * ## Ownership
 *
 * `customer-owned`, both identities, like every project method: a match run belongs to the
 * project it ran for, and the project belongs to whoever holds `customerId` or
 * `anonymousKey`. Ownership is in the `where` clause; somebody else's project is
 * `NOT_FOUND`. The helper mirrors `project-service.ts`'s `ownedBy` — same precedence,
 * same reason (`ADR-023`).
 *
 * ## A pricing failure never removes a match
 *
 * `08` §Failure modes, `PRC-06`, and the whole reason `09` separates the two passes. Every
 * shape of "no price" — no published book, product not in the book, the engine throwing —
 * lands the company in the results as `priceOnRequest`, ranked below priced companies.
 * Silently dropping it would tell the customer "no manufacturers in your area" about a
 * manufacturer who is there and reachable.
 *
 * ## Determinism
 *
 * `ORDER BY priceOnRequest ASC, score DESC, distanceKm ASC, companyId ASC` (`09` §Ranking).
 * The last key is not decoration: score ties are real (two companies on the prior, in the
 * same proximity band), and an order that depends on array iteration luck is what makes
 * Phase 6's e2e flake. Null distances sort after known ones within their tier — unknown is
 * not nearby.
 */

const ownedBy = (actor: ActorContext) => {
  if (actor.userId !== null) return { customerId: actor.userId, deletedAt: null }
  if (actor.anonymousKey !== null && actor.anonymousKey !== '') {
    return { anonymousKey: actor.anonymousKey, deletedAt: null }
  }
  return null
}

export const runMatchSchema = z.object({ projectId: z.string().min(1) })
export type RunMatchInput = z.infer<typeof runMatchSchema>

export const getMatchRunSchema = z.object({ projectId: z.string().min(1) })
export type GetMatchRunInput = z.infer<typeof getMatchRunSchema>

/**
 * What the **customer** sees per result. Band only, never line items (`ADR-006`), and no
 * score number — `09` §Explainability gives the customer a sentence, the admin the numbers.
 */
export type MatchResultView = {
  rank: number
  companyId: string
  displayName: string
  bandLowKurus: number | null
  bandHighKurus: number | null
  priceOnRequest: boolean
  distanceKm: number | null
}

export type MatchRunView = {
  matchRunId: string
  projectId: string
  createdAt: Date
  resultCount: number
  results: MatchResultView[]
}

type PricedCandidate = {
  priceCalculationId: string | null
  bandLowKurus: number | null
  bandHighKurus: number | null
  priceOnRequest: boolean
}

/** Deterministic ranking — the exact ORDER BY, in one comparator. */
export function compareForRank(
  a: { priceOnRequest: boolean; score: number; distanceKm: number | null; companyId: string },
  b: { priceOnRequest: boolean; score: number; distanceKm: number | null; companyId: string },
): number {
  if (a.priceOnRequest !== b.priceOnRequest) return a.priceOnRequest ? 1 : -1
  if (a.score !== b.score) return b.score - a.score
  if (a.distanceKm !== b.distanceKm) {
    if (a.distanceKm === null) return 1
    if (b.distanceKm === null) return -1
    return a.distanceKm - b.distanceKm
  }
  return a.companyId < b.companyId ? -1 : a.companyId > b.companyId ? 1 : 0
}

export const runMatch = serviceMethod<RunMatchInput, MatchRunView>(
  'matching',
  'runMatch',
  {
    kind: 'customer-owned',
    describe: 'a match run belongs to the project it ran for',
    scopedBy: ['userId', 'anonymousKey'],
  },
  async (actor, input) => {
    const started = Date.now()

    const owner = ownedBy(actor)
    if (owner === null) return err(notFound('Project'))

    const project = await prisma.project.findFirst({
      where: { id: input.projectId, ...owner },
      include: { product: true, values: true },
    })
    if (project === null) return err(notFound('Project'))

    /*
     * `08` §Failure modes: a project without a basis is `PRECONDITION`, blocked here rather
     * than surfacing per candidate. DRAFT means readiness was never established; CLOSED
     * means the customer ended it.
     */
    if (project.status !== 'READY' && project.status !== 'SUBMITTED') {
      return err(precondition('matching runs on a READY project'))
    }

    const selectedOptionIds = project.values
      .map((value) => value.optionId)
      .filter((optionId): optionId is string => optionId !== null)

    // ── 1 · eligibility, one SQL query ────────────────────────────────────────
    const candidates = await eligibleCompaniesForProject(project.id)

    const weights = await matchWeights()

    if (candidates.length === 0) {
      /*
       * A legitimate outcome, persisted like any other: `09` §Zero-result handling's
       * widening and "notify me" are the results *page's* behaviour (5.6–5.9); the run
       * itself records that this project, at this moment, matched nobody.
       */
      const emptyRun = await prisma.matchRun.create({
        data: {
          projectId: project.id,
          weightsVersion: weights.version,
          resultCount: 0,
          durationMs: Date.now() - started,
        },
      })

      return ok({
        matchRunId: emptyRun.id,
        projectId: project.id,
        createdAt: emptyRun.createdAt,
        resultCount: 0,
        results: [],
      })
    }

    const companyIds = candidates.map((candidate) => candidate.companyId)

    // ── batched signal loads — no per-candidate queries ───────────────────────
    const [companies, offeredCounts, portfolioCounts, books, meanRating, settings] =
      await Promise.all([
        prisma.company.findMany({
          where: { id: { in: companyIds } },
          select: { id: true, displayName: true, updatedAt: true, priceOnRequest: true },
        }),
        selectedOptionIds.length === 0
          ? Promise.resolve([])
          : prisma.companyProductOption.groupBy({
              by: ['companyProductId'],
              where: {
                optionId: { in: selectedOptionIds },
                isOffered: true,
                companyProduct: { companyId: { in: companyIds }, productId: project.productId },
              },
              _count: { _all: true },
            }),
        prisma.portfolioItem.groupBy({
          by: ['companyId'],
          where: { companyId: { in: companyIds }, productId: project.productId },
          _count: { _all: true },
        }),
        prisma.priceBook.findMany({
          where: { companyId: { in: companyIds }, status: 'PUBLISHED' },
          include: { items: true, optionPrices: true, adjustments: true, rules: true },
        }),
        platformMeanRating(),
        bandSettings(),
      ])

    const companyById = new Map(companies.map((company) => [company.id, company]))
    const bookByCompany = new Map(books.map((book) => [book.companyId, book]))
    const portfolioByCompany = new Map(
      portfolioCounts.map((row) => [row.companyId, row._count._all]),
    )

    // groupBy keys on companyProductId; map it back to the company.
    const companyProducts = await prisma.companyProduct.findMany({
      where: { companyId: { in: companyIds }, productId: project.productId },
      select: { id: true, companyId: true },
    })
    const companyByCompanyProduct = new Map(companyProducts.map((row) => [row.id, row.companyId]))
    const offeredByCompany = new Map<string, number>()
    for (const row of offeredCounts) {
      const companyId = companyByCompanyProduct.get(row.companyProductId)
      if (companyId !== undefined) offeredByCompany.set(companyId, row._count._all)
    }

    const engineProject: ProjectInput = {
      productId: project.productId,
      basisType: project.product.basisType,
      areaM2: project.areaM2,
      lengthM: null,
      units: project.product.basisType === 'UNIT' ? project.quantity : null,
      perimeterM:
        project.widthMm !== null && project.depthMm !== null
          ? (2 * (project.widthMm + project.depthMm)) / 1000
          : null,
      heightM: project.heightMm === null ? null : project.heightMm / 1000,
      quantity: project.quantity,
      selectedOptionIds,
      cityId: project.cityId,
      districtId: project.districtId,
    }

    const now = new Date()

    // ── 2 · score, 3 · price — per candidate, in memory ──────────────────────
    const scored: Array<{
      companyId: string
      score: number
      breakdown: ScoreBreakdown
      distanceKm: number | null
      priced: PricedCandidate
      calculation: {
        priceBookId: string
        priceBookVersion: number
        netKurus: number
        bandLowKurus: number
        bandHighKurus: number
        breakdown: unknown
        engineVersion: number
      } | null
    }> = []

    for (const candidate of candidates) {
      const company = companyById.get(candidate.companyId)
      if (company === undefined) continue

      const distanceKm = candidate.distanceMetres === null ? null : candidate.distanceMetres / 1000

      const signals: CandidateSignals = {
        companyId: candidate.companyId,
        distanceKm,
        radiusKm: candidate.radiusKm,
        selectedOptionCount: selectedOptionIds.length,
        offeredOptionCount: offeredByCompany.get(candidate.companyId) ?? 0,
        // Reviews are Phase 7: everyone sits on the Bayesian prior, by design.
        ratingSum: 0,
        ratingCount: 0,
        // OfferRequest is Phase 6: no response history exists to be medianed.
        medianResponseMinutes: null,
        completedEngagements: 0,
        portfolioCount: portfolioByCompany.get(candidate.companyId) ?? 0,
        priceBookPublishedAt: bookByCompany.get(candidate.companyId)?.publishedAt ?? null,
        profileUpdatedAt: company.updatedAt,
        verifiedAt: candidate.verifiedAt,
      }

      const { score, breakdown } = scoreCandidate(signals, {
        weights,
        platformMeanRating: meanRating,
        now,
      })

      // ── the pricing pass. Every failure shape is a result, never a removal ──
      let priced: PricedCandidate = {
        priceCalculationId: null,
        bandLowKurus: null,
        bandHighKurus: null,
        priceOnRequest: true,
      }
      let calculation: (typeof scored)[number]['calculation'] = null

      const book = bookByCompany.get(candidate.companyId)

      if (book !== undefined && !company.priceOnRequest) {
        try {
          const item = book.items.find((row) => row.productId === project.productId) ?? null
          const result = calculateEstimate(
            engineProject,
            {
              version: book.version,
              item:
                item === null
                  ? null
                  : {
                      basePriceKurus: item.basePriceKurus,
                      minProjectPriceKurus: item.minProjectPriceKurus,
                      setupFeeKurus: item.setupFeeKurus,
                    },
              optionPrices: book.optionPrices,
              regionAdjustments: book.adjustments,
              rules: book.rules,
            },
            settings,
          )

          if (result.status === 'priced') {
            priced = {
              priceCalculationId: null, // filled after the row is written
              bandLowKurus: result.bandLowKurus,
              bandHighKurus: result.bandHighKurus,
              priceOnRequest: false,
            }
            calculation = {
              priceBookId: book.id,
              priceBookVersion: book.version,
              netKurus: result.netKurus,
              bandLowKurus: result.bandLowKurus,
              bandHighKurus: result.bandHighKurus,
              breakdown: JSON.parse(JSON.stringify(result.breakdown)) as object,
              engineVersion: result.engineVersion,
            }
          }
          // 'price-on-request' and 'unpriceable' keep the default: in the list, no band.
        } catch (error) {
          /*
           * `08` §Failure modes: engine throws → match returned without a price,
           * `system_error_price_unavailable`, logged with the engine version. The company
           * stays in the results.
           */
          const { ENGINE_VERSION } = await import('@/modules/pricing/domain/engine')
          console.error(
            `pricing failed for company ${candidate.companyId} on project ${project.id} ` +
              `(engineVersion ${ENGINE_VERSION}):`,
            error,
          )
        }
      }

      scored.push({
        companyId: candidate.companyId,
        score,
        breakdown: {
          ...breakdown,
          // Q22's other half, for §Explainability: how accurate each end of the distance was.
          proximityBand: breakdown.proximityBand,
        },
        distanceKm,
        priced,
        calculation,
      })
    }

    // ── 4 · ranking ───────────────────────────────────────────────────────────
    scored.sort((a, b) =>
      compareForRank(
        { ...a, priceOnRequest: a.priced.priceOnRequest },
        { ...b, priceOnRequest: b.priced.priceOnRequest },
      ),
    )

    // ── 5 · persistence — the run, its calculations and its results, atomically ──
    const view = await prisma.$transaction(async (tx) => {
      const run = await tx.matchRun.create({
        data: {
          projectId: project.id,
          weightsVersion: weights.version,
          resultCount: scored.length,
          durationMs: Date.now() - started,
        },
      })

      const results: MatchResultView[] = []

      for (const [index, entry] of scored.entries()) {
        let priceCalculationId: string | null = null

        if (entry.calculation !== null) {
          const row = await tx.priceCalculation.create({
            data: {
              projectId: project.id,
              companyId: entry.companyId,
              priceBookId: entry.calculation.priceBookId,
              priceBookVersion: entry.calculation.priceBookVersion,
              netKurus: entry.calculation.netKurus,
              bandLowKurus: entry.calculation.bandLowKurus,
              bandHighKurus: entry.calculation.bandHighKurus,
              breakdown: entry.calculation.breakdown as object,
              engineVersion: entry.calculation.engineVersion,
              actorUserId: actor.userId,
              requestIp: actor.ip === 'unknown' ? null : actor.ip,
            },
          })
          priceCalculationId = row.id
        }

        const rank = index + 1

        await tx.matchResult.create({
          data: {
            matchRunId: run.id,
            companyId: entry.companyId,
            score: entry.score,
            rank,
            scoreBreakdown: JSON.parse(JSON.stringify(entry.breakdown)) as object,
            priceCalculationId,
            priceOnRequest: entry.priced.priceOnRequest,
            distanceKm: entry.distanceKm,
          },
        })

        results.push({
          rank,
          companyId: entry.companyId,
          displayName: companyById.get(entry.companyId)?.displayName ?? '',
          bandLowKurus: entry.priced.bandLowKurus,
          bandHighKurus: entry.priced.bandHighKurus,
          priceOnRequest: entry.priced.priceOnRequest,
          distanceKm: entry.distanceKm,
        })
      }

      return {
        matchRunId: run.id,
        projectId: project.id,
        createdAt: run.createdAt,
        resultCount: scored.length,
        results,
      }
    })

    return ok(view)
  },
)

/**
 * The stored run — `09` §Pipeline: *"revisiting does not recompute"*. Returns the latest
 * run's customer view; `runMatch` is the explicit re-run.
 */
export const getMatchRun = serviceMethod<GetMatchRunInput, MatchRunView>(
  'matching',
  'getMatchRun',
  {
    kind: 'customer-owned',
    describe: 'a match run is read through the project that owns it',
    scopedBy: ['userId', 'anonymousKey'],
  },
  async (actor, input) => {
    const owner = ownedBy(actor)
    if (owner === null) return err(notFound('MatchRun'))

    const run = await prisma.matchRun.findFirst({
      // Ownership rides the relation filter — still the `where` clause, never post-fetch.
      where: { projectId: input.projectId, project: owner },
      orderBy: { createdAt: 'desc' },
      include: {
        results: {
          orderBy: { rank: 'asc' },
          include: {
            company: { select: { displayName: true } },
            priceCalculation: { select: { bandLowKurus: true, bandHighKurus: true } },
          },
        },
      },
    })
    if (run === null) return err(notFound('MatchRun'))

    return ok({
      matchRunId: run.id,
      projectId: run.projectId,
      createdAt: run.createdAt,
      resultCount: run.resultCount,
      results: run.results.map((result) => ({
        rank: result.rank,
        companyId: result.companyId,
        displayName: result.company.displayName,
        bandLowKurus: result.priceCalculation?.bandLowKurus ?? null,
        bandHighKurus: result.priceCalculation?.bandHighKurus ?? null,
        priceOnRequest: result.priceOnRequest,
        distanceKm: result.distanceKm,
      })),
    })
  },
)

export const matchService = { runMatch, getMatchRun } satisfies Record<string, { meta: unknown }>
