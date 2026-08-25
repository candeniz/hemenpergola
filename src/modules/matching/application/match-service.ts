import 'server-only'

import {} from 'zod'

import type { ActorContext } from '@/shared/context/actor'
import { prisma } from '@/shared/db'
import { notify } from '@/modules/notification/infrastructure/notify'
import {
  companiesServingLocationWithoutProduct,
  eligibleCompaniesForProject,
  type EligibleCompanyRow,
} from '@/shared/geo'
import { err, notFound, ok, precondition, rateLimited } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

import {
  calculateEstimate,
  ENGINE_VERSION,
  type BandSettings,
  type ProjectInput,
} from '@/modules/pricing/domain/engine'
import { bandSettings } from '@/modules/pricing/infrastructure/band-settings'

import {
  scoreCandidate,
  type CandidateSignals,
  type MatchWeights,
  type ScoreBreakdown,
} from '../domain/scoring'
import { matchWeights, platformMeanRating } from '../infrastructure/match-settings'

/**
 * The match pipeline — tasks 5.1–5.8, `09-manufacturer-matching.md` §Pipeline:
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
 * lands the company in the results, ranked below priced companies. `priceState` keeps the
 * shapes apart for display (5.8): `ON_REQUEST` is a company's choice or a book gap,
 * `UNAVAILABLE` is our engine failing, and telling a customer to "ask the manufacturer" for
 * a price we failed to compute would be the second, dressed as the first.
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

/** `09` §Zero-result handling's "widened by one step", in kilometres. */
export const WIDEN_STEP_KM = 25

// The contract lives in ./dto (CLAUDE.md §Conventions, extracted in 11.2); re-exported
// so every existing import site keeps working.
export * from './dto'

import {
  type GetMatchRunInput,
  type MatchPriceState,
  type MatchResultView,
  type MatchRunView,
  type RunMatchInput,
  type WatchSupplyGapInput,
  type ZeroResultFallbackInput,
  type ZeroResultFallbackView,
} from './dto'

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

type LoadedProject = {
  id: string
  productId: string
  areaM2: number | null
  widthMm: number | null
  depthMm: number | null
  heightMm: number | null
  quantity: number
  cityId: string | null
  districtId: string | null
  product: { basisType: 'AREA_M2' | 'LENGTH_M' | 'UNIT' }
  values: { optionId: string | null }[]
}

type ScoredCandidate = {
  companyId: string
  displayName: string
  score: number
  breakdown: ScoreBreakdown
  distanceKm: number | null
  priceState: MatchPriceState
  bandLowKurus: number | null
  bandHighKurus: number | null
  incomplete: boolean
  calculation: {
    priceBookId: string
    priceBookVersion: number
    netKurus: number
    bandLowKurus: number
    bandHighKurus: number
    breakdown: object
    engineVersion: number
  } | null
}

/**
 * Stages 2–4 for one candidate set: batched signal loads, the pure score, the pricing pass,
 * the deterministic sort. Shared by `runMatch` (which persists a `MatchRun`) and
 * `zeroResultFallback` (which persists only the `PriceCalculation` rows `ADR-006` requires
 * for any estimate a customer is shown).
 */
async function scoreAndPrice(
  project: LoadedProject,
  candidates: EligibleCompanyRow[],
  context: { weights: MatchWeights; meanRating: number; settings: BandSettings },
): Promise<ScoredCandidate[]> {
  if (candidates.length === 0) return []

  const companyIds = candidates.map((candidate) => candidate.companyId)
  const selectedOptionIds = project.values
    .map((value) => value.optionId)
    .filter((optionId): optionId is string => optionId !== null)

  // Batched — no per-candidate queries (`09` §Performance).
  const [companies, offeredCounts, portfolioCounts, books, companyProducts] = await Promise.all([
    prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: {
        id: true,
        displayName: true,
        updatedAt: true,
        priceOnRequest: true,
        // Phase 7 · task 7.3 — the denormalised aggregates `company.analytics_refresh`
        // maintains. Until that job has run for a company these sit at their defaults,
        // which the scorer maps onto the Bayesian prior — the newcomer treatment.
        ratingSum: true,
        reviewCount: true,
        medianResponseMinutes: true,
        completedEngagements: true,
      },
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
    prisma.companyProduct.findMany({
      where: { companyId: { in: companyIds }, productId: project.productId },
      select: { id: true, companyId: true },
    }),
  ])

  const companyById = new Map(companies.map((company) => [company.id, company]))
  const bookByCompany = new Map(books.map((book) => [book.companyId, book]))
  const portfolioByCompany = new Map(portfolioCounts.map((row) => [row.companyId, row._count._all]))

  // groupBy keys on companyProductId; map it back to the company.
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
  const scored: ScoredCandidate[] = []

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
      // Phase 7 · 7.3: read from Company's denormalised aggregates. A company the
      // analytics job never touched carries the defaults (0 / 0 / null / 0), which is
      // exactly the Bayesian-prior newcomer case Phase 5 designed for.
      ratingSum: company.ratingSum,
      ratingCount: company.reviewCount,
      medianResponseMinutes: company.medianResponseMinutes,
      completedEngagements: company.completedEngagements,
      portfolioCount: portfolioByCompany.get(candidate.companyId) ?? 0,
      priceBookPublishedAt: bookByCompany.get(candidate.companyId)?.publishedAt ?? null,
      profileUpdatedAt: company.updatedAt,
      verifiedAt: candidate.verifiedAt,
    }

    const { score, breakdown } = scoreCandidate(signals, {
      weights: context.weights,
      platformMeanRating: context.meanRating,
      now,
    })

    // ── the pricing pass. Every failure shape is a result, never a removal ────
    let priceState: MatchPriceState = 'ON_REQUEST'
    let bandLowKurus: number | null = null
    let bandHighKurus: number | null = null
    let incomplete = false
    let calculation: ScoredCandidate['calculation'] = null

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
          context.settings,
        )

        if (result.status === 'priced') {
          priceState = 'PRICED'
          bandLowKurus = result.bandLowKurus
          bandHighKurus = result.bandHighKurus
          incomplete = result.incomplete
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
        // 'price-on-request' and 'unpriceable' keep ON_REQUEST: in the list, no band.
      } catch (error) {
        /*
         * `08` §Failure modes: engine throws → match returned without a price,
         * `system_error_price_unavailable`, logged with the engine version. The company
         * stays in the results, and the state stays distinct from ON_REQUEST so the page
         * can say "cannot be calculated right now" instead of "ask them" (5.8).
         */
        priceState = 'UNAVAILABLE'
        console.error(
          `pricing failed for company ${candidate.companyId} on project ${project.id} ` +
            `(engineVersion ${ENGINE_VERSION}):`,
          error,
        )
      }
    }

    scored.push({
      companyId: candidate.companyId,
      displayName: company.displayName,
      score,
      breakdown,
      distanceKm,
      priceState,
      bandLowKurus,
      bandHighKurus,
      incomplete,
      calculation,
    })
  }

  // ── ranking — `priceOnRequest` for the sort is "has no band", whatever the reason ──
  scored.sort((a, b) =>
    compareForRank(
      { ...a, priceOnRequest: a.priceState !== 'PRICED' },
      { ...b, priceOnRequest: b.priceState !== 'PRICED' },
    ),
  )

  return scored
}

/**
 * `ADR-006`: every calculation a customer may see is persisted with actor and IP. Returns
 * calculation ids keyed by company. `createManyAndReturn` — one statement, not one per row.
 */
async function persistCalculations(
  tx: Pick<typeof prisma, 'priceCalculation'>,
  projectId: string,
  actor: ActorContext,
  scored: ScoredCandidate[],
): Promise<Map<string, string>> {
  const withCalculation = scored.filter((entry) => entry.calculation !== null)
  if (withCalculation.length === 0) return new Map()

  const rows = await tx.priceCalculation.createManyAndReturn({
    data: withCalculation.map((entry) => ({
      projectId,
      companyId: entry.companyId,
      priceBookId: entry.calculation!.priceBookId,
      priceBookVersion: entry.calculation!.priceBookVersion,
      netKurus: entry.calculation!.netKurus,
      bandLowKurus: entry.calculation!.bandLowKurus,
      bandHighKurus: entry.calculation!.bandHighKurus,
      breakdown: entry.calculation!.breakdown,
      engineVersion: entry.calculation!.engineVersion,
      actorUserId: actor.userId,
      requestIp: actor.ip === 'unknown' ? null : actor.ip,
    })),
    select: { id: true, companyId: true },
  })

  return new Map(rows.map((row) => [row.companyId, row.id]))
}

function toView(entry: ScoredCandidate, rank: number): MatchResultView {
  return {
    rank,
    companyId: entry.companyId,
    displayName: entry.displayName,
    bandLowKurus: entry.bandLowKurus,
    bandHighKurus: entry.bandHighKurus,
    priceOnRequest: entry.priceState !== 'PRICED',
    priceState: entry.priceState,
    incomplete: entry.incomplete,
    distanceKm: entry.distanceKm,
  }
}

async function loadOwnedReadyProject(
  actor: ActorContext,
  projectId: string,
): Promise<{ ok: true; project: LoadedProject } | { ok: false; error: 'not-found' | 'not-ready' }> {
  const owner = ownedBy(actor)
  if (owner === null) return { ok: false, error: 'not-found' }

  const project = await prisma.project.findFirst({
    where: { id: projectId, ...owner },
    include: { product: { select: { basisType: true } }, values: { select: { optionId: true } } },
  })
  if (project === null) return { ok: false, error: 'not-found' }

  /*
   * `08` §Failure modes: a project without a basis is `PRECONDITION`, blocked here rather
   * than surfacing per candidate. DRAFT means readiness was never established; CLOSED means
   * the customer ended it.
   */
  if (project.status !== 'READY' && project.status !== 'SUBMITTED') {
    return { ok: false, error: 'not-ready' }
  }

  return { ok: true, project }
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

    // 06 §Rate limits (ADR-006 anti-scraping): 30/h per user, 60/h per IP — every run
    // computes estimates, and estimates are the thing the limit protects.
    const { consumeRateLimit } = await import('@/shared/rate-limit')
    if (actor.userId !== null) {
      const perUser = await consumeRateLimit('priceEstimateUser', 'user', actor.userId)
      if (!perUser.allowed) return err(rateLimited(perUser.retryAfterSeconds))
    }
    const perIp = await consumeRateLimit('priceEstimateIp', 'ip', actor.ip)
    if (!perIp.allowed) return err(rateLimited(perIp.retryAfterSeconds))

    const loaded = await loadOwnedReadyProject(actor, input.projectId)
    if (!loaded.ok) {
      return loaded.error === 'not-found'
        ? err(notFound('Project'))
        : err(precondition('matching runs on a READY project'))
    }
    const project = loaded.project

    // ── 1 · eligibility, one SQL query ────────────────────────────────────────
    const [candidates, weights, meanRating, settings] = await Promise.all([
      eligibleCompaniesForProject(project.id),
      matchWeights(),
      platformMeanRating(),
      bandSettings(),
    ])

    // ── 2–4 · score, price, rank ──────────────────────────────────────────────
    const scored = await scoreAndPrice(project, candidates, { weights, meanRating, settings })

    // ── 5 · persistence — the run, its calculations and its results, atomically ──
    const view = await prisma.$transaction(async (tx) => {
      const run = await tx.matchRun.create({
        data: {
          projectId: project.id,
          weightsVersion: weights.version,
          /*
           * Zero is a legitimate, persisted outcome: `09` §Zero-result handling's ladder is
           * the results *page's* behaviour, and the run records that this project, at this
           * moment, matched nobody.
           */
          resultCount: scored.length,
          durationMs: Date.now() - started,
        },
      })

      const calculationIds = await persistCalculations(tx, project.id, actor, scored)

      if (scored.length > 0) {
        await tx.matchResult.createMany({
          data: scored.map((entry, index) => ({
            matchRunId: run.id,
            companyId: entry.companyId,
            score: entry.score,
            rank: index + 1,
            scoreBreakdown: JSON.parse(JSON.stringify(entry.breakdown)) as object,
            priceCalculationId: calculationIds.get(entry.companyId) ?? null,
            priceOnRequest: entry.priceState !== 'PRICED',
            priceState: entry.priceState,
            distanceKm: entry.distanceKm,
          })),
        })
      }

      return {
        matchRunId: run.id,
        projectId: project.id,
        createdAt: run.createdAt,
        resultCount: scored.length,
        results: scored.map((entry, index) => toView(entry, index + 1)),
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
            /*
             * `breakdown` is selected to derive ONE boolean and is not returned: whether an
             * unpriced option contributed zero (`08` §Failure modes' caveat). The line
             * items themselves never cross this boundary (`ADR-006`).
             */
            priceCalculation: {
              select: { bandLowKurus: true, bandHighKurus: true, breakdown: true },
            },
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
      results: run.results.map((result) => {
        const breakdown = result.priceCalculation?.breakdown as
          { unpricedOptionIds?: unknown[] } | undefined

        return {
          rank: result.rank,
          companyId: result.companyId,
          displayName: result.company.displayName,
          bandLowKurus: result.priceCalculation?.bandLowKurus ?? null,
          bandHighKurus: result.priceCalculation?.bandHighKurus ?? null,
          priceOnRequest: result.priceOnRequest,
          priceState: result.priceState,
          incomplete: (breakdown?.unpricedOptionIds?.length ?? 0) > 0,
          distanceKm: result.distanceKm,
        }
      }),
    })
  },
)

/**
 * `09` §Zero-result handling, steps 1 and 2 — computed for the page when the stored run is
 * empty, **not persisted as matches**: a widened result is an offer of the page, not a fact
 * about the project, and writing it to `MatchRun` would make `resultCount: 0` a lie. The
 * `PriceCalculation` rows are persisted — any band a customer sees is logged (`ADR-006`).
 */
export const zeroResultFallback = serviceMethod<ZeroResultFallbackInput, ZeroResultFallbackView>(
  'matching',
  'zeroResultFallback',
  {
    kind: 'customer-owned',
    describe: 'the fallback is read through the project that owns it',
    scopedBy: ['userId', 'anonymousKey'],
  },
  async (actor, input) => {
    const loaded = await loadOwnedReadyProject(actor, input.projectId)
    if (!loaded.ok) {
      return loaded.error === 'not-found'
        ? err(notFound('Project'))
        : err(precondition('the fallback runs on a READY project'))
    }
    const project = loaded.project

    const [widenedCandidates, nearbyRows, weights, meanRating, settings] = await Promise.all([
      eligibleCompaniesForProject(project.id, { widenRadiusKm: WIDEN_STEP_KM }),
      companiesServingLocationWithoutProduct(project.id),
      matchWeights(),
      platformMeanRating(),
      bandSettings(),
    ])

    const scored = await scoreAndPrice(project, widenedCandidates, {
      weights,
      meanRating,
      settings,
    })
    await persistCalculations(prisma, project.id, actor, scored)

    const nearbyCompanies =
      nearbyRows.length === 0
        ? []
        : await prisma.company.findMany({
            where: { id: { in: nearbyRows.map((row) => row.companyId) } },
            select: { id: true, displayName: true },
            orderBy: { id: 'asc' },
          })

    return ok({
      widened: scored.map((entry, index) => toView(entry, index + 1)),
      nearby: nearbyCompanies.map((company) => ({
        companyId: company.id,
        displayName: company.displayName,
      })),
      widenedByKm: WIDEN_STEP_KM,
    })
  },
)

/**
 * `09` §Zero-result handling step 3 — "notify me when a manufacturer covers my area",
 * stored as a `Notification` subscription. One per user per project; repeating the click
 * reports `watching: true` rather than stacking rows. Repeated zero-result districts are
 * the supply-acquisition backlog, which is why the payload carries the location and the
 * product rather than just the project id.
 */
export const watchSupplyGap = serviceMethod<WatchSupplyGapInput, { watching: true }>(
  'matching',
  'watchSupplyGap',
  {
    kind: 'customer-owned',
    describe: 'a supply-gap watch belongs to the project that produced the gap',
    scopedBy: ['userId', 'anonymousKey'],
  },
  async (actor, input) => {
    if (actor.userId === null) {
      // The results page is behind the account wall (`ADR-021`), so this is unreachable in
      // the UI — but a subscription with nobody to notify is a row that can never fire.
      return err(precondition('watching a supply gap needs an account to notify'))
    }

    const owner = ownedBy(actor)
    if (owner === null) return err(notFound('Project'))

    const project = await prisma.project.findFirst({
      where: { id: input.projectId, ...owner },
      select: { id: true, productId: true, cityId: true, districtId: true },
    })
    if (project === null) return err(notFound('Project'))

    await notify({
      userId: actor.userId,
      type: 'supply_gap_watch',
      payload: {
        projectId: project.id,
        productId: project.productId,
        cityId: project.cityId,
        districtId: project.districtId,
      },
      dedupeOn: [{ path: ['projectId'], equals: project.id }],
    })

    return ok({ watching: true })
  },
)

export const matchService = {
  runMatch,
  getMatchRun,
  zeroResultFallback,
  watchSupplyGap,
} satisfies Record<string, { meta: unknown }>
