import 'server-only'

import {} from 'zod'

import { authorize } from '@/modules/iam/application/authorization'
import { PERMISSIONS } from '@/modules/iam/domain/permissions'
import { prisma } from '@/shared/db'
import { err, notFound, ok, precondition } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

import { inspectPriceBook } from '../domain/diagnostics'
import { bandSettings } from '../infrastructure/band-settings'
import { calculateEstimate, type ProjectInput } from '../domain/engine'

import { getPriceBook, toEngineInput } from './price-book-service'
import type {} from './estimate-dto'

/**
 * The simulator — task 3.5, `08-pricing-engine.md` §Simulator.
 *
 * *"The same pure function against a draft book, returning the full breakdown. Same company,
 * `price_book.read`, no leak. This is the only supported way to check a price book before
 * publishing. Publishing to test is not a workflow."*
 *
 * Two things follow from that sentence and are worth naming:
 *
 *   **It runs against a `DRAFT`.** Every other pricing path takes `PUBLISHED` only. This is
 *   the exception, it is scoped to the owning company, and it writes no `PriceCalculation` —
 *   a simulation is not an estimate anybody was shown, and storing it would pollute both
 *   `PRC-02`'s history and `ADR-006`'s scraping signal with the manufacturer's own probing.
 *
 *   **It returns the owner view.** `OwnerEstimate`, never `CustomerEstimate`: the whole point
 *   is the breakdown. The type makes handing it to a customer surface impossible.
 */

// The contract lives in ./dto (extracted in 11.2). price-book-service re-exports the
// same file — harmless, same module.
export * from './dto'

import { type EstimateForProjectInput, type SimulateInput, type SimulateResult } from './dto'

export const simulatePriceBook = serviceMethod<SimulateInput, SimulateResult>(
  'pricing',
  'simulatePriceBook',
  { kind: 'permission', permission: PERMISSIONS.PRICE_BOOK_READ },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.PRICE_BOOK_READ)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId

    /*
     * Reuses `getPriceBook`, which already scopes by company in its `where` clause. Repeating
     * the lookup here would be a second place for the ownership rule to be wrong.
     */
    const loaded = await getPriceBook(actor, { companyId, priceBookId: input.priceBookId })
    if (!loaded.ok) return err(loaded.error)

    const book = loaded.value
    const settings = await bandSettings()

    const project: ProjectInput = {
      productId: input.productId,
      basisType: input.basisType,
      areaM2: input.areaM2 ?? null,
      lengthM: input.lengthM ?? null,
      units: input.units ?? null,
      perimeterM: input.perimeterM ?? null,
      heightM: input.heightM ?? null,
      quantity: input.quantity,
      selectedOptionIds: input.selectedOptionIds,
      cityId: input.cityId ?? null,
      districtId: input.districtId ?? null,
    }

    const engineBook = toEngineInput(book, input.productId)
    const result = calculateEstimate(project, engineBook, settings)

    if (result.status !== 'priced') {
      return ok({
        estimate: null,
        unpricedReason: result.reason,
        // Still worth inspecting: "this product is not in the book" is exactly the moment to
        // show that a rule elsewhere never fires.
        warnings: inspectPriceBook(project, engineBook, settings),
        priceBookVersion: book.version,
        priceBookStatus: book.status,
      })
    }

    return ok({
      estimate: {
        companyId,
        netKurus: result.netKurus,
        bandLowKurus: result.bandLowKurus,
        bandHighKurus: result.bandHighKurus,
        breakdown: result.breakdown,
        incomplete: result.incomplete,
        engineVersion: result.engineVersion,
      },
      unpricedReason: null,
      warnings: inspectPriceBook(project, engineBook, settings),
      priceBookVersion: book.version,
      priceBookStatus: book.status,
    })
  },
)

/**
 * The published-book path — what Phase 5's matching will call per candidate.
 *
 * Separate from the simulator because it has different rules: `PUBLISHED` only, and it
 * **persists** a `PriceCalculation` with the actor and the IP (`ADR-006` §Anti-scraping).
 * Merging the two behind a flag would mean one careless caller writing a row for every
 * keystroke in the editor.
 */
export const estimateForProject = serviceMethod<
  EstimateForProjectInput & { requestIp?: string | null },
  SimulateResult
>(
  'pricing',
  'estimateForProject',
  { kind: 'permission', permission: PERMISSIONS.PRICE_BOOK_READ },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.PRICE_BOOK_READ)
    if (!allowed.ok) return err(allowed.error)

    const book = await prisma.priceBook.findFirst({
      where: { companyId: input.companyId, status: 'PUBLISHED' },
      include: { items: true, optionPrices: true, adjustments: true, rules: true },
    })
    if (book === null) return err(notFound('PriceBook'))

    const settings = await bandSettings()
    const project: ProjectInput = {
      productId: input.productId,
      basisType: input.basisType,
      areaM2: input.areaM2 ?? null,
      lengthM: input.lengthM ?? null,
      units: input.units ?? null,
      perimeterM: input.perimeterM ?? null,
      heightM: input.heightM ?? null,
      quantity: input.quantity,
      selectedOptionIds: input.selectedOptionIds,
      cityId: input.cityId ?? null,
      districtId: input.districtId ?? null,
    }

    const item = book.items.find((row) => row.productId === input.productId) ?? null
    const result = calculateEstimate(
      project,
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

    if (result.status === 'unpriceable') {
      // `08` §Failure modes: a project with no basis should never have reached here — it is
      // not `READY`, and validation upstream is what enforces that.
      return err(precondition('the project has no area, length or unit count'))
    }

    if (result.status === 'price-on-request') {
      return ok({
        estimate: null,
        unpricedReason: result.reason,
        warnings: [],
        priceBookVersion: book.version,
        priceBookStatus: book.status,
      })
    }

    await prisma.priceCalculation.create({
      data: {
        projectId: input.projectId ?? null,
        companyId: input.companyId,
        priceBookId: book.id,
        priceBookVersion: book.version,
        netKurus: result.netKurus,
        bandLowKurus: result.bandLowKurus,
        bandHighKurus: result.bandHighKurus,
        breakdown: JSON.parse(JSON.stringify(result.breakdown)) as object,
        engineVersion: result.engineVersion,
        actorUserId: actor.userId,
        requestIp: input.requestIp ?? actor.ip ?? null,
      },
    })

    return ok({
      estimate: {
        companyId: input.companyId,
        netKurus: result.netKurus,
        bandLowKurus: result.bandLowKurus,
        bandHighKurus: result.bandHighKurus,
        breakdown: result.breakdown,
        incomplete: result.incomplete,
        engineVersion: result.engineVersion,
      },
      unpricedReason: null,
      warnings: [],
      priceBookVersion: book.version,
      priceBookStatus: book.status,
    })
  },
)

export const simulateService = { simulatePriceBook, estimateForProject } satisfies Record<
  string,
  { meta: unknown }
>
