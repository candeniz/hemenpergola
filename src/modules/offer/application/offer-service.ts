import 'server-only'

import { z } from 'zod'

import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { authorize } from '@/modules/iam/application/authorization'
import { PERMISSIONS } from '@/modules/iam/domain/permissions'
import { prisma } from '@/shared/db'
import { notify } from '@/modules/notification/infrastructure/notify'
import { conflict, err, notFound, ok } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'
import { enqueue, JOB } from '@/shared/jobs'

import { computeOfferTotals } from '../domain/offer-math'
import { transition, type OfferRequestStatus } from '../domain/state-machine'

/**
 * Offers — task 6.8, `11` §Offers and KDV. Same service shape as every other transition
 * caller: `FOR UPDATE` → machine → in-tx side effects → notifications after commit.
 *
 * ## The number (`GSF-2026-0042`)
 *
 * Per-company, human-readable, unique platform-wide — and **not `count(*) + 1`**: two
 * offers created simultaneously both count the same rows and both claim the same number.
 * The allocator reads the last issued number for the (prefix, year), proposes the next,
 * and leans on `Offer.number`'s UNIQUE to lose the race loudly; on `P2002` it re-reads and
 * retries. The integration suite fires two concurrent sends and asserts two *different*
 * numbers.
 *
 * ## Revision supersedes, never overwrites
 *
 * `revise` marks the previous SENT offer `SUPERSEDED` and inserts a new row with a new
 * number; both remain readable. Same reasoning as `10` §Admin authoring's "never delete a
 * referenced option": six months later, "which figure did we send in July" must be
 * answerable from the table, not from memory.
 */

const offerLineSchema = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.number().positive().max(10_000),
  unit: z.string().trim().min(1).max(20),
  unitPriceKurus: z.number().int().positive(),
})

export const sendOfferSchema = z.object({
  offerRequestId: z.string().min(1),
  lines: z.array(offerLineSchema).min(1).max(50),
  /** Defaults from `PlatformSetting('tax.kdv_default_percent')` — Q6's unconfirmed 20. */
  taxRate: z.number().min(0).max(100).optional(),
  validUntil: z.coerce.date(),
  note: z.string().trim().max(1000).optional(),
})
export type SendOfferInput = z.infer<typeof sendOfferSchema>

export const decideOfferSchema = z.object({
  offerRequestId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
})
export type DecideOfferInput = z.infer<typeof decideOfferSchema>

export const markOutcomeSchema = z.object({
  offerRequestId: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
})
export type MarkOutcomeInput = z.infer<typeof markOutcomeSchema>

export type OfferView = {
  offerId: string
  number: string
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED'
  netKurus: number
  taxRate: number
  taxKurus: number
  grossKurus: number
  validUntil: Date
  note: string | null
  sentAt: Date | null
  lines: {
    description: string
    quantity: number
    unit: string
    unitPriceKurus: number
    lineNetKurus: number
  }[]
}

async function defaultTaxRate(): Promise<number> {
  const row = await prisma.platformSetting.findUnique({
    where: { key: 'tax.kdv_default_percent' },
  })
  const value = row?.value
  return typeof value === 'number' && Number.isFinite(value) ? value : 20
}

/** Letters only, upper-cased, padded — `Marmara Cam` → `MAR`, `GSF Yapı` → `GSF`. */
function numberPrefix(slug: string): string {
  const letters = slug.replace(/[^a-zA-Z]/g, '').toUpperCase()
  return (letters + 'XXX').slice(0, 3)
}

/**
 * Allocate the next number for (company, year). UNIQUE + retry, not `count(*) + 1` — see
 * the file comment. Runs OUTSIDE the caller's main transaction on purpose: a number burnt
 * by a retry is a gap in the sequence, which is harmless; a serialisation failure in the
 * middle of the send transaction is not.
 */
async function allocateOfferNumber(companySlug: string): Promise<string> {
  const prefix = `${numberPrefix(companySlug)}-${new Date().getFullYear()}-`

  const last = await prisma.offer.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  })

  const lastSeq = last === null ? 0 : Number.parseInt(last.number.slice(prefix.length), 10) || 0
  return `${prefix}${String(lastSeq + 1).padStart(4, '0')}`
}

function toOfferView(offer: {
  id: string
  number: string
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED'
  netKurus: number
  taxRate: number
  taxKurus: number
  grossKurus: number
  validUntil: Date
  note: string | null
  sentAt: Date | null
  lines: {
    description: string
    quantity: number
    unit: string
    unitPriceKurus: number
    lineNetKurus: number
    sortOrder: number
  }[]
}): OfferView {
  return {
    offerId: offer.id,
    number: offer.number,
    status: offer.status,
    netKurus: offer.netKurus,
    taxRate: offer.taxRate,
    taxKurus: offer.taxKurus,
    grossKurus: offer.grossKurus,
    validUntil: offer.validUntil,
    note: offer.note,
    sentAt: offer.sentAt,
    lines: [...offer.lines]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPriceKurus: line.unitPriceKurus,
        lineNetKurus: line.lineNetKurus,
      })),
  }
}

const OFFER_SELECT = {
  id: true,
  number: true,
  status: true,
  netKurus: true,
  taxRate: true,
  taxKurus: true,
  grossKurus: true,
  validUntil: true,
  note: true,
  sentAt: true,
  lines: {
    select: {
      description: true,
      quantity: true,
      unit: true,
      unitPriceKurus: true,
      lineNetKurus: true,
      sortOrder: true,
    },
  },
} as const

// ── send / revise (manufacturer) ─────────────────────────────────────────────

export const sendOffer = serviceMethod<SendOfferInput, OfferView>(
  'offer',
  'sendOffer',
  { kind: 'permission', permission: PERMISSIONS.OFFER_SEND },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.OFFER_SEND)
    if (!allowed.ok) return err(allowed.error)
    if (actor.companyId === null) return err(notFound('OfferRequest'))

    const taxRate = input.taxRate ?? (await defaultTaxRate())
    const totals = computeOfferTotals(input.lines, taxRate)

    const company = await prisma.company.findUniqueOrThrow({
      where: { id: actor.companyId },
      select: { slug: true },
    })

    // UNIQUE + retry: the loop is the concurrency answer, the constraint is the referee.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const number = await allocateOfferNumber(company.slug)

      try {
        const outcome = await prisma.$transaction(async (tx) => {
          const rows = await tx.$queryRaw<
            { id: string; status: OfferRequestStatus; slaExpiresAt: Date; customerId: string }[]
          >`
            SELECT "id", "status", "slaExpiresAt", "customerId"
            FROM "OfferRequest"
            WHERE "id" = ${input.offerRequestId} AND "companyId" = ${actor.companyId}
            FOR UPDATE
          `
          const row = rows[0]
          if (row === undefined) return { kind: 'error' as const, error: notFound('OfferRequest') }

          const event = row.status === 'OFFER_SENT' ? ('revise' as const) : ('send_offer' as const)
          const next = transition(row.status, event, {
            now: new Date(),
            actor: 'manufacturer',
            slaExpiresAt: row.slaExpiresAt,
            offer: {
              lineCount: input.lines.length,
              validUntil: input.validUntil,
              taxRateSet: Number.isFinite(taxRate),
            },
          })
          if (!next.ok) return { kind: 'error' as const, error: next.error }

          if (event === 'revise') {
            // Supersede, never overwrite: the old figures stay readable.
            await tx.offer.updateMany({
              where: { offerRequestId: row.id, status: 'SENT' },
              data: { status: 'SUPERSEDED' },
            })
          }

          const offer = await tx.offer.create({
            data: {
              offerRequestId: row.id,
              number,
              status: 'SENT',
              netKurus: totals.netKurus,
              taxRate: totals.taxRate,
              taxKurus: totals.taxKurus,
              grossKurus: totals.grossKurus,
              validUntil: input.validUntil,
              note: input.note ?? null,
              sentAt: new Date(),
              lines: {
                create: totals.lines.map((line, index) => ({
                  sortOrder: index,
                  description: line.description,
                  quantity: line.quantity,
                  unit: line.unit,
                  unitPriceKurus: line.unitPriceKurus,
                  lineNetKurus: line.lineNetKurus,
                })),
              },
            },
            select: OFFER_SELECT,
          })

          await tx.offerRequest.update({ where: { id: row.id }, data: { status: next.value } })

          return { kind: 'sent' as const, offer, customerId: row.customerId, event }
        })

        if (outcome.kind === 'error') return err(outcome.error)

        // After commit: the decision is audited and the customer told (`19` §Audit lists
        // "offer sends and decisions").
        void recordAudit(actor, {
          entityType: 'OfferRequest',
          entityId: input.offerRequestId,
          action: 'offer_sent',
          after: { number: outcome.offer.number, grossKurus: outcome.offer.grossKurus },
        })
        {
          const companyName = (
            await prisma.company.findUniqueOrThrow({
              where: { id: actor.companyId! },
              select: { displayName: true },
            })
          ).displayName
          await notify({
            userId: outcome.customerId,
            type: outcome.event === 'revise' ? 'offer_revised' : 'offer_received',
            payload: {
              offerRequestId: input.offerRequestId,
              offerNumber: outcome.offer.number,
              companyName,
              validUntil: input.validUntil.toLocaleDateString('tr-TR'),
            },
          })
        }

        // 13 row 10: warn before validUntil passes — scheduled at send, fired by the
        // worker 48 h out; a validity shorter than that has nothing sane to schedule.
        const expiringAt = input.validUntil.getTime() - 48 * 3_600_000
        if (expiringAt > Date.now()) {
          await enqueue(
            JOB.offerExpiring,
            { offerId: outcome.offer.id },
            {
              startAfterSeconds: Math.floor((expiringAt - Date.now()) / 1000),
              singletonKey: `offexp:${outcome.offer.id}`,
            },
          )
        }

        return ok(toOfferView(outcome.offer))
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') continue // number raced — retry
        throw error
      }
    }

    return err(conflict('could not allocate an offer number; please retry'))
  },
)

// ── decide (customer) ────────────────────────────────────────────────────────

async function decide(
  actor: Parameters<typeof authorize>[0],
  input: DecideOfferInput,
  event: 'accept_offer' | 'reject_offer',
) {
  if (actor.userId === null) return err(notFound('OfferRequest'))

  const outcome = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string; status: OfferRequestStatus; slaExpiresAt: Date; companyId: string }[]
    >`
      SELECT "id", "status", "slaExpiresAt", "companyId"
      FROM "OfferRequest"
      WHERE "id" = ${input.offerRequestId} AND "customerId" = ${actor.userId}
      FOR UPDATE
    `
    const row = rows[0]
    if (row === undefined) return { kind: 'error' as const, error: notFound('OfferRequest') }

    const activeOffer = await tx.offer.findFirst({
      where: { offerRequestId: row.id, status: 'SENT' },
      select: { id: true, validUntil: true, number: true },
    })

    const next = transition(row.status, event, {
      now: new Date(),
      actor: 'customer',
      slaExpiresAt: row.slaExpiresAt,
      offerValidUntil: activeOffer?.validUntil ?? null,
    })
    if (!next.ok) return { kind: 'error' as const, error: next.error }

    await tx.offerRequest.update({ where: { id: row.id }, data: { status: next.value } })
    if (activeOffer !== null) {
      await tx.offer.update({
        where: { id: activeOffer.id },
        data: {
          status: event === 'accept_offer' ? 'ACCEPTED' : 'REJECTED',
          decidedAt: new Date(),
          decisionNote: input.note ?? null,
        },
      })
    }

    return {
      kind: 'decided' as const,
      requestId: row.id,
      companyId: row.companyId,
      next: next.value,
    }
  })

  if (outcome.kind === 'error') return err(outcome.error)

  const owners = await prisma.companyMembership.findMany({
    where: { companyId: outcome.companyId, role: 'OWNER' },
    select: { userId: true },
  })
  const offerNumber =
    (
      await prisma.offer.findFirst({
        where: { offerRequestId: outcome.requestId },
        orderBy: { createdAt: 'desc' },
        select: { number: true },
      })
    )?.number ?? '—'
  for (const owner of owners) {
    await notify({
      userId: owner.userId,
      type: event === 'accept_offer' ? 'offer_accepted' : 'offer_rejected',
      payload: { offerRequestId: outcome.requestId, offerNumber },
    })
  }

  return ok({ offerRequestId: outcome.requestId, status: outcome.next })
}

export const acceptOffer = serviceMethod<
  DecideOfferInput,
  { offerRequestId: string; status: OfferRequestStatus }
>(
  'offer',
  'acceptOffer',
  {
    kind: 'customer-owned',
    describe: 'a customer decides only on offers sent to their own requests',
    scopedBy: ['userId'],
  },
  async (actor, input) => decide(actor, input, 'accept_offer'),
)

export const rejectOffer = serviceMethod<
  DecideOfferInput,
  { offerRequestId: string; status: OfferRequestStatus }
>(
  'offer',
  'rejectOffer',
  {
    kind: 'customer-owned',
    describe: 'a customer decides only on offers sent to their own requests',
    scopedBy: ['userId'],
  },
  async (actor, input) => decide(actor, input, 'reject_offer'),
)

// ── outcome (manufacturer) ───────────────────────────────────────────────────

async function markOutcome(
  actor: Parameters<typeof authorize>[0],
  input: MarkOutcomeInput,
  event: 'mark_won' | 'mark_lost',
) {
  const allowed = authorize(actor, PERMISSIONS.OFFER_SEND)
  if (!allowed.ok) return err(allowed.error)
  if (actor.companyId === null) return err(notFound('OfferRequest'))

  const outcome = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string; status: OfferRequestStatus; slaExpiresAt: Date }[]
    >`
      SELECT "id", "status", "slaExpiresAt"
      FROM "OfferRequest"
      WHERE "id" = ${input.offerRequestId} AND "companyId" = ${actor.companyId}
      FOR UPDATE
    `
    const row = rows[0]
    if (row === undefined) return { kind: 'error' as const, error: notFound('OfferRequest') }

    const next = transition(row.status, event, {
      now: new Date(),
      actor: 'manufacturer',
      slaExpiresAt: row.slaExpiresAt,
      reason: input.reason ?? null,
    })
    if (!next.ok) return { kind: 'error' as const, error: next.error }

    await tx.offerRequest.update({
      where: { id: row.id },
      data: { status: next.value, closedReason: input.reason ?? null },
    })

    return { kind: 'marked' as const, status: next.value }
  })

  if (outcome.kind === 'error') return err(outcome.error)

  void recordAudit(actor, {
    entityType: 'OfferRequest',
    entityId: input.offerRequestId,
    action: event === 'mark_won' ? 'offer_marked_won' : 'offer_marked_lost',
    reason: input.reason ?? undefined,
  })

  return ok({ offerRequestId: input.offerRequestId, status: outcome.status })
}

export const markWon = serviceMethod<
  MarkOutcomeInput,
  { offerRequestId: string; status: OfferRequestStatus }
>('offer', 'markWon', { kind: 'permission', permission: PERMISSIONS.OFFER_SEND }, (actor, input) =>
  markOutcome(actor, input, 'mark_won'),
)

export const markLost = serviceMethod<
  MarkOutcomeInput,
  { offerRequestId: string; status: OfferRequestStatus }
>('offer', 'markLost', { kind: 'permission', permission: PERMISSIONS.OFFER_SEND }, (actor, input) =>
  markOutcome(actor, input, 'mark_lost'),
)

// ── read (customer) — the offer beside the original estimate (6.9) ──────────

export const getOffersForRequestSchema = z.object({ offerRequestId: z.string().min(1) })
export type GetOffersForRequestInput = z.infer<typeof getOffersForRequestSchema>

export type CustomerOfferView = {
  offerRequestId: string
  requestStatus: OfferRequestStatus
  companyName: string
  /** Every version, newest first — a revision supersedes but stays readable (`11`). */
  offers: OfferView[]
  /**
   * The estimate the customer originally saw, band only (`ADR-006`), so the offer screen
   * explains the gap in place (`ADR-007`): the estimate was net of KDV, the offer is not.
   */
  originalEstimate: { bandLowKurus: number; bandHighKurus: number } | null
}

export const getOffersForRequest = serviceMethod<GetOffersForRequestInput, CustomerOfferView>(
  'offer',
  'getOffersForRequest',
  {
    kind: 'customer-owned',
    describe: 'a customer reads offers only on their own requests',
    scopedBy: ['userId'],
  },
  async (actor, input) => {
    if (actor.userId === null) return err(notFound('OfferRequest'))

    const row = await prisma.offerRequest.findFirst({
      where: { id: input.offerRequestId, customerId: actor.userId },
      select: {
        id: true,
        status: true,
        company: { select: { displayName: true } },
        priceCalculation: { select: { bandLowKurus: true, bandHighKurus: true } },
        offers: { select: OFFER_SELECT, orderBy: { createdAt: 'desc' } },
      },
    })
    if (row === null) return err(notFound('OfferRequest'))

    return ok({
      offerRequestId: row.id,
      requestStatus: row.status,
      companyName: row.company.displayName,
      offers: row.offers.map(toOfferView),
      originalEstimate:
        row.priceCalculation === null
          ? null
          : {
              bandLowKurus: row.priceCalculation.bandLowKurus,
              bandHighKurus: row.priceCalculation.bandHighKurus,
            },
    })
  },
)

export const offerService = {
  sendOffer,
  acceptOffer,
  rejectOffer,
  markWon,
  markLost,
  getOffersForRequest,
} satisfies Record<string, { meta: unknown }>
