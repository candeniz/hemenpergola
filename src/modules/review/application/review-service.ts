import 'server-only'

import { z } from 'zod'

import { authorize, requireAdmin } from '@/modules/iam/application/authorization'
import { PERMISSIONS } from '@/modules/iam/domain/permissions'
import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { notify } from '@/modules/notification/infrastructure/notify'
import { prisma } from '@/shared/db'
import { enqueue, JOB } from '@/shared/jobs'
import { conflict, err, notFound, ok, precondition } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

import type { OfferRequestStatus } from '@/modules/offer/domain/state-machine'

/**
 * Reviews — `16-reviews-and-ratings.md`, task 7.2. Integrity is the design driver: these
 * feed the matching score (`09`), so a fake or premature review changes rankings.
 *
 * The rules, each with its enforcement:
 *
 *   eligibility   `SURVEY_COMPLETED` or later, checked against the request's real status —
 *                 no free-text reviews, ever
 *   one per       UNIQUE on `Review.offerRequestId`: a table property, not a UI check
 *   moderation    everything lands `PENDING`; only `PUBLISHED` reviews are ever listed and
 *                 only `PUBLISHED` enter aggregates — two separate integration tests
 *   no deletion   a review row is never removed; `deletedAt` (unused in V1's surfaces)
 *                 exists for the KVKK path and excludes from display and aggregates while
 *                 the history stays readable
 *   anti-gaming   one customer may review the same company at most twice in 12 months,
 *                 and a manufacturer cannot see PENDING reviews at all
 *
 * Aggregates are recomputed by `company.analytics_refresh` on publish, reject and
 * response (`16` §Aggregates) — enqueued here, never computed inline, so the numbers have
 * exactly one writer.
 */

const ELIGIBLE_STATES: readonly OfferRequestStatus[] = [
  'SURVEY_COMPLETED',
  'OFFER_SENT',
  'OFFER_ACCEPTED',
  'OFFER_REJECTED',
  'WON',
  'LOST',
]

const TERMINAL_STATES: readonly OfferRequestStatus[] = ['WON', 'LOST']
const REVIEW_WINDOW_DAYS = 90
const MAX_REVIEWS_PER_COMPANY_PER_YEAR = 2

const rating = z.number().int().min(1).max(5)

export const submitReviewSchema = z.object({
  offerRequestId: z.string().min(1),
  ratingOverall: rating,
  ratingQuality: rating,
  ratingCommunication: rating,
  ratingTimeliness: rating,
  title: z.string().trim().max(100).optional(),
  body: z.string().trim().min(50).max(2000),
})
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>

export const moderateReviewSchema = z
  .object({
    reviewId: z.string().min(1),
    decision: z.enum(['PUBLISHED', 'REJECTED']),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((input) => input.decision !== 'REJECTED' || (input.reason ?? '').length > 0, {
    message: 'Rejection requires a reason — 16 §Moderation notifies the author with it.',
    path: ['reason'],
  })
export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>

export const respondToReviewSchema = z.object({
  reviewId: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
})
export type RespondToReviewInput = z.infer<typeof respondToReviewSchema>

export type ReviewView = {
  id: string
  ratingOverall: number
  ratingQuality: number
  ratingCommunication: number
  ratingTimeliness: number
  title: string | null
  body: string
  status: 'PENDING' | 'PUBLISHED' | 'REJECTED'
  rejectionReason: string | null
  publishedAt: Date | null
  createdAt: Date
  response: { body: string; createdAt: Date } | null
}

function toView(row: {
  id: string
  ratingOverall: number
  ratingQuality: number
  ratingCommunication: number
  ratingTimeliness: number
  title: string | null
  body: string
  status: 'PENDING' | 'PUBLISHED' | 'REJECTED'
  rejectionReason: string | null
  publishedAt: Date | null
  createdAt: Date
  response: { body: string; createdAt: Date } | null
}): ReviewView {
  // Field-by-field pick, never a spread (the lead-dto lesson): a column added to the
  // model later does not silently join the wire shape.
  return {
    id: row.id,
    ratingOverall: row.ratingOverall,
    ratingQuality: row.ratingQuality,
    ratingCommunication: row.ratingCommunication,
    ratingTimeliness: row.ratingTimeliness,
    title: row.title,
    body: row.body,
    status: row.status,
    rejectionReason: row.rejectionReason,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    response:
      row.response === null ? null : { body: row.response.body, createdAt: row.response.createdAt },
  }
}

const REVIEW_SELECT = {
  id: true,
  ratingOverall: true,
  ratingQuality: true,
  ratingCommunication: true,
  ratingTimeliness: true,
  title: true,
  body: true,
  status: true,
  rejectionReason: true,
  publishedAt: true,
  createdAt: true,
  response: { select: { body: true, createdAt: true } },
} as const

// ── customer side ─────────────────────────────────────────────────────────────

export const getReviewEligibility = serviceMethod<
  { offerRequestId: string },
  { eligible: boolean; reason: string | null; review: ReviewView | null }
>(
  'review',
  'getReviewEligibility',
  {
    kind: 'customer-owned',
    describe: 'a customer checks eligibility only on their own requests',
    scopedBy: ['userId'],
  },
  async (actor, input) => {
    if (actor.userId === null) return err(notFound('OfferRequest'))

    const request = await prisma.offerRequest.findFirst({
      where: { id: input.offerRequestId, customerId: actor.userId },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        review: { select: REVIEW_SELECT },
      },
    })
    if (request === null) return err(notFound('OfferRequest'))

    if (request.review !== null) {
      return ok({ eligible: false, reason: 'already-reviewed', review: toView(request.review) })
    }
    if (!ELIGIBLE_STATES.includes(request.status)) {
      return ok({ eligible: false, reason: 'survey-not-completed', review: null })
    }
    if (TERMINAL_STATES.includes(request.status)) {
      const windowEnd = request.updatedAt.getTime() + REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000
      if (Date.now() > windowEnd) {
        return ok({ eligible: false, reason: 'window-closed', review: null })
      }
    }
    return ok({ eligible: true, reason: null, review: null })
  },
)

export const submitReview = serviceMethod<SubmitReviewInput, ReviewView>(
  'review',
  'submitReview',
  {
    kind: 'customer-owned',
    describe: 'a customer reviews only engagements they own that reached survey',
    scopedBy: ['userId'],
  },
  async (actor, input) => {
    if (actor.userId === null) return err(notFound('OfferRequest'))

    const request = await prisma.offerRequest.findFirst({
      where: { id: input.offerRequestId, customerId: actor.userId },
      select: { id: true, status: true, companyId: true, updatedAt: true },
    })
    if (request === null) return err(notFound('OfferRequest'))

    if (!ELIGIBLE_STATES.includes(request.status)) {
      return err(precondition('Yorum, keşif tamamlandıktan sonra yapılabilir (16 §Eligibility).'))
    }
    if (TERMINAL_STATES.includes(request.status)) {
      const windowEnd = request.updatedAt.getTime() + REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000
      if (Date.now() > windowEnd) {
        return err(precondition('Yorum penceresi kapandı (90 gün).'))
      }
    }

    // Anti-gaming: at most two reviews of the same company per customer per 12 months.
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    const priorCount = await prisma.review.count({
      where: {
        customerId: actor.userId,
        companyId: request.companyId,
        createdAt: { gte: yearAgo },
      },
    })
    if (priorCount >= MAX_REVIEWS_PER_COMPANY_PER_YEAR) {
      return err(precondition('Aynı firmaya 12 ay içinde en fazla iki yorum yapılabilir.'))
    }

    try {
      const row = await prisma.review.create({
        data: {
          offerRequestId: request.id,
          companyId: request.companyId,
          customerId: actor.userId,
          ratingOverall: input.ratingOverall,
          ratingQuality: input.ratingQuality,
          ratingCommunication: input.ratingCommunication,
          ratingTimeliness: input.ratingTimeliness,
          title: input.title ?? null,
          body: input.body,
        },
        select: REVIEW_SELECT,
      })
      // No notification here on purpose (`16` §Anti-gaming): the manufacturer must not
      // see who is about to review them before publication.
      return ok(toView(row))
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        // The UNIQUE spoke: one review per OfferRequest is a table property.
        return err(conflict('Bu talep için zaten bir yorum var.'))
      }
      throw error
    }
  },
)

// ── manufacturer side ─────────────────────────────────────────────────────────

export const listPublishedReviewsAsCompany = serviceMethod<Record<string, never>, ReviewView[]>(
  'review',
  'listPublishedReviewsAsCompany',
  { kind: 'permission', permission: PERMISSIONS.REVIEW_RESPOND },
  async (actor) => {
    const allowed = authorize(actor, PERMISSIONS.REVIEW_RESPOND)
    if (!allowed.ok) return err(allowed.error)
    if (actor.companyId === null) return err(notFound('Review'))

    // PUBLISHED only, even for the company's own list: a manufacturer cannot see who is
    // about to review them (`16` §Anti-gaming), and a REJECTED review was never public.
    const rows = await prisma.review.findMany({
      where: { companyId: actor.companyId, status: 'PUBLISHED', deletedAt: null },
      orderBy: { publishedAt: 'desc' },
      select: REVIEW_SELECT,
    })
    return ok(rows.map(toView))
  },
)

export const respondToReview = serviceMethod<RespondToReviewInput, { responseId: string }>(
  'review',
  'respondToReview',
  { kind: 'permission', permission: PERMISSIONS.REVIEW_RESPOND },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.REVIEW_RESPOND)
    if (!allowed.ok) return err(allowed.error)
    if (actor.companyId === null) return err(notFound('Review'))

    const review = await prisma.review.findFirst({
      where: {
        id: input.reviewId,
        companyId: actor.companyId,
        status: 'PUBLISHED',
        deletedAt: null,
      },
      select: { id: true, customerId: true, companyId: true },
    })
    if (review === null) return err(notFound('Review'))

    try {
      const response = await prisma.reviewResponse.create({
        data: { reviewId: review.id, responderUserId: actor.userId ?? '', body: input.body },
        select: { id: true },
      })

      // After the write (`16` §Aggregates recomputes on response too, and the customer
      // hears about it).
      const company = await prisma.company.findUniqueOrThrow({
        where: { id: review.companyId },
        select: { displayName: true },
      })
      await notify({
        userId: review.customerId,
        type: 'review_responded',
        payload: { companyName: company.displayName, reviewId: review.id },
      })
      await enqueue(
        JOB.analyticsRefresh,
        { companyId: review.companyId },
        { singletonKey: `analytics:${review.companyId}` },
      )

      return ok({ responseId: response.id })
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        return err(conflict('Bu yoruma zaten bir yanıt verilmiş (16: bir yanıt, düzenleme yok).'))
      }
      throw error
    }
  },
)

// ── moderation (admin) ────────────────────────────────────────────────────────

export const listPendingReviews = serviceMethod<
  Record<string, never>,
  (ReviewView & { companyName: string })[]
>('review', 'listPendingReviews', { kind: 'admin' }, async (actor) => {
  const allowed = requireAdmin(actor)
  if (!allowed.ok) return err(allowed.error)

  const rows = await prisma.review.findMany({
    where: { status: 'PENDING', deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { ...REVIEW_SELECT, company: { select: { displayName: true } } },
  })
  return ok(rows.map((row) => ({ ...toView(row), companyName: row.company.displayName })))
})

export const moderateReview = serviceMethod<
  ModerateReviewInput,
  { reviewId: string; status: 'PUBLISHED' | 'REJECTED' }
>('review', 'moderateReview', { kind: 'admin' }, async (actor, input) => {
  const allowed = requireAdmin(actor)
  if (!allowed.ok) return err(allowed.error)

  const review = await prisma.review.findFirst({
    where: { id: input.reviewId, deletedAt: null },
    select: { id: true, status: true, companyId: true, customerId: true },
  })
  if (review === null) return err(notFound('Review'))
  if (review.status !== 'PENDING') {
    return err(conflict(`Review already moderated: ${review.status}`))
  }

  await prisma.review.update({
    where: { id: review.id },
    data:
      input.decision === 'PUBLISHED'
        ? { status: 'PUBLISHED', publishedAt: new Date(), rejectionReason: null }
        : { status: 'REJECTED', rejectionReason: input.reason ?? null },
  })

  await recordAudit(actor, {
    action: input.decision === 'PUBLISHED' ? 'review_published' : 'review_rejected',
    entityType: 'Review',
    entityId: review.id,
    companyId: review.companyId,
    reason: input.reason,
  })

  // ── after the write: notifications and the aggregate refresh ───────────────
  if (input.decision === 'PUBLISHED') {
    const owners = await prisma.companyMembership.findMany({
      where: { companyId: review.companyId, role: 'OWNER' },
      select: { userId: true },
    })
    const published = await prisma.review.findUniqueOrThrow({
      where: { id: review.id },
      select: { ratingOverall: true },
    })
    for (const owner of owners) {
      await notify({
        userId: owner.userId,
        type: 'review_published',
        payload: { rating: published.ratingOverall, reviewId: review.id },
      })
    }
  } else {
    await notify({
      userId: review.customerId,
      type: 'review_rejected',
      payload: { reason: input.reason ?? '', reviewId: review.id },
    })
  }

  await enqueue(
    JOB.analyticsRefresh,
    { companyId: review.companyId },
    { singletonKey: `analytics:${review.companyId}` },
  )

  return ok({ reviewId: review.id, status: input.decision })
})
