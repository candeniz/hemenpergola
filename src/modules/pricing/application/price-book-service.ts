import 'server-only'

import { z } from 'zod'

import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { authorize } from '@/modules/iam/application/authorization'
import { PERMISSIONS } from '@/modules/iam/domain/permissions'
import { prisma } from '@/shared/db'
import { conflict, err, notFound, ok, precondition } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'
import { notify } from '@/modules/notification/infrastructure/notify'

import type { PriceBookInput } from '../domain/engine'

/**
 * Price-book lifecycle — task 3.3, `04-data-model.md` §Pricing, `08-pricing-engine.md`
 * §Versioning.
 *
 * `DRAFT` → `PUBLISHED` → `ARCHIVED`, and a `PUBLISHED` book is **immutable**. Editing means
 * cloning to a new `DRAFT`, publishing it as `version + 1` and archiving the old one. There
 * is deliberately no update path that reaches a published book:
 *
 *   a stored `PriceCalculation` names a `priceBookVersion`, and `PRC-02` makes it
 *   append-only. If a published book could be edited, that version number would point at
 *   different numbers than the ones the customer was shown, and every historical estimate
 *   would become a figure nobody can reproduce.
 *
 * The "one live book per company" rule is a **partial unique index** in migration 5, not a
 * check in `publish`. A service check loses to two browser tabs; the index does not.
 */

/** Every mutating method scopes by company in the `where` clause — never a post-fetch check. */
const companyScoped = z.object({ companyId: z.string().min(1) })

export const listPriceBooksSchema = companyScoped
export type ListPriceBooksInput = z.infer<typeof listPriceBooksSchema>

export const getPriceBookSchema = companyScoped.extend({ priceBookId: z.string().min(1) })
export type GetPriceBookInput = z.infer<typeof getPriceBookSchema>

export const createDraftSchema = companyScoped.extend({
  /** Clone from an existing book. `08`/`3.4`: cloning is first-class, not a hidden menu. */
  fromPriceBookId: z.string().min(1).optional(),
  note: z.string().max(500).optional(),
})
export type CreateDraftInput = z.infer<typeof createDraftSchema>

export const publishPriceBookSchema = companyScoped.extend({ priceBookId: z.string().min(1) })
export type PublishPriceBookInput = z.infer<typeof publishPriceBookSchema>

const modeShape = {
  mode: z.enum(['FLAT', 'PERCENT']),
  valueKurus: z.number().int().optional().nullable(),
  percent: z.number().min(0).max(100).optional().nullable(),
}

/**
 * One call saves the whole draft.
 *
 * Field-at-a-time endpoints would mean a half-saved price book is a reachable state, and a
 * half-saved price book that someone then publishes is a wrong price. The editor holds the
 * whole book anyway (`3.4`), so the transaction boundary matches what the manufacturer
 * thinks they are doing: "save my prices".
 */
export const savePriceBookSchema = companyScoped.extend({
  priceBookId: z.string().min(1),
  note: z.string().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        basePriceKurus: z.number().int().min(0),
        unit: z.enum(['PER_M2', 'PER_M', 'PER_UNIT']),
        minProjectPriceKurus: z.number().int().min(0).default(0),
        setupFeeKurus: z.number().int().min(0).optional().nullable(),
      }),
    )
    .max(200),
  optionPrices: z
    .array(
      z.object({
        optionId: z.string().min(1),
        mode: z.enum(['FLAT', 'PER_M2', 'PER_M', 'PER_UNIT', 'PERCENT']),
        valueKurus: z.number().int().optional().nullable(),
        percent: z.number().min(0).max(100).optional().nullable(),
      }),
    )
    .max(500),
  adjustments: z
    .array(
      z.object({
        cityId: z.string().min(1).optional().nullable(),
        districtId: z.string().min(1).optional().nullable(),
        ...modeShape,
      }),
    )
    .max(300),
  rules: z
    .array(
      z.object({
        kind: z.enum(['AREA_DISCOUNT', 'VALUE_DISCOUNT', 'SIZE_SURCHARGE', 'HEIGHT_SURCHARGE']),
        thresholdMin: z.number().min(0).optional().nullable(),
        thresholdMax: z.number().min(0).optional().nullable(),
        ...modeShape,
        note: z.string().max(200).optional().nullable(),
      }),
    )
    .max(100),
})
export type SavePriceBookInput = z.infer<typeof savePriceBookSchema>

export type PriceBookSummary = {
  priceBookId: string
  version: number
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  publishedAt: Date | null
  note: string | null
  itemCount: number
  updatedAt: Date
}

export type PriceBookDetail = PriceBookSummary & {
  items: {
    productId: string
    basePriceKurus: number
    unit: 'PER_M2' | 'PER_M' | 'PER_UNIT'
    minProjectPriceKurus: number
    setupFeeKurus: number | null
  }[]
  optionPrices: {
    optionId: string
    mode: 'FLAT' | 'PER_M2' | 'PER_M' | 'PER_UNIT' | 'PERCENT'
    valueKurus: number | null
    percent: number | null
  }[]
  adjustments: {
    cityId: string | null
    districtId: string | null
    mode: 'FLAT' | 'PERCENT'
    valueKurus: number | null
    percent: number | null
  }[]
  rules: {
    id: string
    kind: 'AREA_DISCOUNT' | 'VALUE_DISCOUNT' | 'SIZE_SURCHARGE' | 'HEIGHT_SURCHARGE'
    thresholdMin: number | null
    thresholdMax: number | null
    mode: 'FLAT' | 'PERCENT'
    valueKurus: number | null
    percent: number | null
    note: string | null
  }[]
}

export const listPriceBooks = serviceMethod<ListPriceBooksInput, { books: PriceBookSummary[] }>(
  'pricing',
  'listPriceBooks',
  { kind: 'permission', permission: PERMISSIONS.PRICE_BOOK_READ },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.PRICE_BOOK_READ)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId
    const books = await prisma.priceBook.findMany({
      where: { companyId },
      orderBy: { version: 'desc' },
      include: { _count: { select: { items: true } } },
    })

    return ok({
      books: books.map((book) => ({
        priceBookId: book.id,
        version: book.version,
        status: book.status,
        publishedAt: book.publishedAt,
        note: book.note,
        itemCount: book._count.items,
        updatedAt: book.updatedAt,
      })),
    })
  },
)

export const getPriceBook = serviceMethod<GetPriceBookInput, PriceBookDetail>(
  'pricing',
  'getPriceBook',
  { kind: 'permission', permission: PERMISSIONS.PRICE_BOOK_READ },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.PRICE_BOOK_READ)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId
    // Ownership in the `where` clause: another company's book matches nothing rather than
    // being found and then refused (`CLAUDE.md` non-negotiable 3).
    const book = await prisma.priceBook.findFirst({
      where: { id: input.priceBookId, companyId },
      include: { items: true, optionPrices: true, adjustments: true, rules: true },
    })
    if (book === null) return err(notFound('PriceBook'))

    return ok(toDetail(book))
  },
)

export const createDraft = serviceMethod<
  CreateDraftInput,
  { priceBookId: string; version: number }
>(
  'pricing',
  'createDraft',
  { kind: 'permission', permission: PERMISSIONS.PRICE_BOOK_WRITE },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.PRICE_BOOK_WRITE)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId

    /*
     * One draft at a time. Two drafts means the manufacturer has to remember which one they
     * were editing, and `publish` has to guess. Cloning an old version into the *existing*
     * draft would silently discard work, so an existing draft is a conflict the screen
     * resolves by sending the manufacturer to it.
     */
    const existingDraft = await prisma.priceBook.findFirst({
      where: { companyId, status: 'DRAFT' },
      select: { id: true, version: true },
    })
    if (existingDraft !== null) {
      return err(conflict(`a draft already exists (v${existingDraft.version})`))
    }

    const source =
      input.fromPriceBookId === undefined
        ? null
        : await prisma.priceBook.findFirst({
            where: { id: input.fromPriceBookId, companyId },
            include: { items: true, optionPrices: true, adjustments: true, rules: true },
          })

    if (input.fromPriceBookId !== undefined && source === null) return err(notFound('PriceBook'))

    const highest = await prisma.priceBook.aggregate({
      where: { companyId },
      _max: { version: true },
    })
    const version = (highest._max.version ?? 0) + 1

    const created = await prisma.priceBook.create({
      data: {
        companyId,
        version,
        status: 'DRAFT',
        note: input.note ?? source?.note ?? null,
        items:
          source === null
            ? undefined
            : {
                create: source.items.map((item) => ({
                  productId: item.productId,
                  basePriceKurus: item.basePriceKurus,
                  unit: item.unit,
                  minProjectPriceKurus: item.minProjectPriceKurus,
                  setupFeeKurus: item.setupFeeKurus,
                })),
              },
        optionPrices:
          source === null
            ? undefined
            : {
                create: source.optionPrices.map((price) => ({
                  optionId: price.optionId,
                  mode: price.mode,
                  valueKurus: price.valueKurus,
                  percent: price.percent,
                })),
              },
        adjustments:
          source === null
            ? undefined
            : {
                create: source.adjustments.map((adjustment) => ({
                  cityId: adjustment.cityId,
                  districtId: adjustment.districtId,
                  mode: adjustment.mode,
                  valueKurus: adjustment.valueKurus,
                  percent: adjustment.percent,
                })),
              },
        rules:
          source === null
            ? undefined
            : {
                create: source.rules.map((rule) => ({
                  kind: rule.kind,
                  thresholdMin: rule.thresholdMin,
                  thresholdMax: rule.thresholdMax,
                  mode: rule.mode,
                  valueKurus: rule.valueKurus,
                  percent: rule.percent,
                  note: rule.note,
                })),
              },
      },
    })

    await recordAudit(actor, {
      action: 'price_book_draft_created',
      entityType: 'PriceBook',
      entityId: created.id,
      companyId,
      after: { version, clonedFrom: source?.version ?? null },
    })

    return ok({ priceBookId: created.id, version })
  },
)

export const savePriceBook = serviceMethod<SavePriceBookInput, { priceBookId: string }>(
  'pricing',
  'savePriceBook',
  { kind: 'permission', permission: PERMISSIONS.PRICE_BOOK_WRITE },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.PRICE_BOOK_WRITE)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId
    const book = await prisma.priceBook.findFirst({
      where: { id: input.priceBookId, companyId },
      select: { id: true, status: true },
    })
    if (book === null) return err(notFound('PriceBook'))

    // The immutability rule, enforced where the write happens rather than trusted to the UI.
    if (book.status !== 'DRAFT') {
      return err(precondition(`a ${book.status} price book cannot be edited; clone it to a draft`))
    }

    /*
     * Replace-in-transaction rather than diff-and-patch. The editor sends the whole book, so
     * a diff would be reconstructing on the server what the client already knows — and a
     * partial failure would leave prices from two different edits in one book.
     */
    await prisma.$transaction(async (tx) => {
      await tx.priceBookItem.deleteMany({ where: { priceBookId: book.id } })
      await tx.priceBookOptionPrice.deleteMany({ where: { priceBookId: book.id } })
      await tx.priceBookRegionAdjustment.deleteMany({ where: { priceBookId: book.id } })
      await tx.priceBookRule.deleteMany({ where: { priceBookId: book.id } })

      await tx.priceBook.update({
        where: { id: book.id },
        data: {
          note: input.note ?? null,
          items: { create: input.items },
          optionPrices: { create: input.optionPrices },
          adjustments: { create: input.adjustments },
          rules: { create: input.rules },
        },
      })
    })

    return ok({ priceBookId: book.id })
  },
)

export const publishPriceBook = serviceMethod<
  PublishPriceBookInput,
  { priceBookId: string; version: number; archivedVersion: number | null }
>(
  'pricing',
  'publishPriceBook',
  { kind: 'permission', permission: PERMISSIONS.PRICE_BOOK_PUBLISH },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.PRICE_BOOK_PUBLISH)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId
    const draft = await prisma.priceBook.findFirst({
      where: { id: input.priceBookId, companyId },
      include: { _count: { select: { items: true } } },
    })
    if (draft === null) return err(notFound('PriceBook'))
    if (draft.status !== 'DRAFT') return err(precondition('only a draft can be published'))

    /*
     * A book with no priced product is not a price book. Publishing one would make the
     * company "priced" for `09`'s ranking while every estimate came back
     * `product-not-in-book` — worse than having no book at all, which at least ranks
     * honestly (`PRC-06`).
     */
    if (draft._count.items === 0) {
      return err(precondition('a price book needs at least one product before it can be published'))
    }

    const archived = await prisma.$transaction(async (tx) => {
      const live = await tx.priceBook.findFirst({
        where: { companyId, status: 'PUBLISHED' },
        select: { id: true, version: true },
      })

      // Archive first: the partial unique index permits exactly one `PUBLISHED` row per
      // company, so the order is not a style choice.
      if (live !== null) {
        await tx.priceBook.update({ where: { id: live.id }, data: { status: 'ARCHIVED' } })
      }

      await tx.priceBook.update({
        where: { id: draft.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishedBy: actor.userId,
          validFrom: new Date(),
        },
      })

      return live
    })

    // 13 row 16's in-app record — Phase 9's trigger scan found the event listed with
    // no call site. Owners only; publishing is their own act, the row is the receipt.
    {
      const owners = await prisma.companyMembership.findMany({
        where: { companyId, role: 'OWNER' },
        select: { userId: true },
      })
      for (const owner of owners) {
        await notify({
          userId: owner.userId,
          type: 'price_book_published',
          payload: { companyId, version: draft.version },
        })
      }
    }

    await recordAudit(actor, {
      action: 'price_book_published',
      entityType: 'PriceBook',
      entityId: draft.id,
      companyId,
      before: archived === null ? undefined : { version: archived.version, status: 'PUBLISHED' },
      after: { version: draft.version, status: 'PUBLISHED' },
    })

    return ok({
      priceBookId: draft.id,
      version: draft.version,
      archivedVersion: archived?.version ?? null,
    })
  },
)

type BookWithRelations = {
  id: string
  version: number
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  publishedAt: Date | null
  note: string | null
  updatedAt: Date
  items: PriceBookDetail['items'][number][]
  optionPrices: PriceBookDetail['optionPrices'][number][]
  adjustments: PriceBookDetail['adjustments'][number][]
  rules: PriceBookDetail['rules'][number][]
}

function toDetail(book: BookWithRelations): PriceBookDetail {
  return {
    priceBookId: book.id,
    version: book.version,
    status: book.status,
    publishedAt: book.publishedAt,
    note: book.note,
    itemCount: book.items.length,
    updatedAt: book.updatedAt,
    items: book.items.map((item) => ({
      productId: item.productId,
      basePriceKurus: item.basePriceKurus,
      unit: item.unit,
      minProjectPriceKurus: item.minProjectPriceKurus,
      setupFeeKurus: item.setupFeeKurus,
    })),
    optionPrices: book.optionPrices.map((price) => ({
      optionId: price.optionId,
      mode: price.mode,
      valueKurus: price.valueKurus,
      percent: price.percent,
    })),
    adjustments: book.adjustments.map((adjustment) => ({
      cityId: adjustment.cityId,
      districtId: adjustment.districtId,
      mode: adjustment.mode,
      valueKurus: adjustment.valueKurus,
      percent: adjustment.percent,
    })),
    rules: book.rules.map((rule) => ({
      id: rule.id,
      kind: rule.kind,
      thresholdMin: rule.thresholdMin,
      thresholdMax: rule.thresholdMax,
      mode: rule.mode,
      valueKurus: rule.valueKurus,
      percent: rule.percent,
      note: rule.note,
    })),
  }
}

/**
 * A `PriceBookDetail` in the shape the pure engine wants, for one product.
 *
 * Here rather than in `domain/` because it is a mapping between an application view model
 * and the engine's input — the engine must not know what a `PriceBookDetail` is, or it stops
 * being usable from Phase 4's project pipeline without dragging this module along.
 */
export function toEngineInput(book: PriceBookDetail, productId: string): PriceBookInput {
  const item = book.items.find((row) => row.productId === productId) ?? null

  return {
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
  }
}

export const priceBookService = {
  listPriceBooks,
  getPriceBook,
  createDraft,
  savePriceBook,
  publishPriceBook,
} satisfies Record<string, { meta: unknown }>
