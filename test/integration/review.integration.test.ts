import { beforeAll, describe, expect, it } from 'vitest'

import {
  getReviewEligibility,
  listPublishedReviewsAsCompany,
  moderateReview,
  respondToReview,
  submitReview,
} from '@/modules/review/application/review-service'
import { runAnalyticsRefresh } from '@/modules/review/infrastructure/analytics-job'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'

import { getPrisma } from './setup'

/**
 * Reviews and the denormalised aggregates — tasks 7.2 and 7.3.
 *
 * The two headline properties, each its own test:
 *
 *   1. an unmoderated review is INVISIBLE — it appears in no listing;
 *   2. an unmoderated review does not enter the AVERAGE — the aggregate counts
 *      PUBLISHED only.
 *
 * And 7.3's only real protection: the columns the job writes equal what the test
 * recomputes independently from the source tables.
 */

let customerId = ''
let companyId = ''
let ownerId = ''
let cityId = ''
let productId = ''
let adminId = ''

const customerActor = (): ActorContext =>
  anonymousActor({ userId: customerId, globalRole: 'CUSTOMER', ip: '203.0.113.40' })

const companyActor = (): ActorContext =>
  anonymousActor({
    userId: ownerId,
    globalRole: 'CUSTOMER',
    companyId,
    companyRole: 'OWNER',
    companyStatus: 'VERIFIED',
    ip: '203.0.113.41',
  })

const adminActor = (): ActorContext =>
  anonymousActor({ userId: adminId, globalRole: 'ADMIN', ip: '203.0.113.42' })

async function requestInStatus(
  status: string,
  overrides: { customerId?: string; responseMinutes?: number } = {},
): Promise<string> {
  const prisma = getPrisma()
  const owner = overrides.customerId ?? customerId

  const project = await prisma.project.create({
    data: {
      customerId: owner,
      productId,
      status: 'SUBMITTED',
      areaM2: 20,
      quantity: 1,
      cityId,
    },
  })
  const consent = await prisma.consent.create({
    data: {
      userId: owner,
      type: 'CONTACT_SHARING',
      textVersion: 'test.v1',
      ip: '203.0.113.40',
      userAgent: 'vitest',
    },
  })
  const createdAt = new Date(Date.now() - 24 * 3_600_000)
  const request = await prisma.offerRequest.create({
    data: {
      projectId: project.id,
      customerId: owner,
      companyId,
      status: status as never,
      slaExpiresAt: new Date(createdAt.getTime() + 48 * 3_600_000),
      createdAt,
      consentId: consent.id,
      ...(status === 'PENDING'
        ? {}
        : {
            respondedAt: new Date(createdAt.getTime() + (overrides.responseMinutes ?? 60) * 60_000),
          }),
    },
  })
  return request.id
}

const REVIEW_BODY =
  'Keşif zamanında yapıldı, montaj ekibi titizdi ve sonuç beklediğimizden iyi oldu. Teşekkürler.'

function reviewInput(offerRequestId: string, overall = 5) {
  return {
    offerRequestId,
    ratingOverall: overall,
    ratingQuality: 4,
    ratingCommunication: 5,
    ratingTimeliness: 3,
    body: REVIEW_BODY,
  }
}

beforeAll(async () => {
  const prisma = getPrisma()

  const city = await prisma.city.create({ data: { name: 'ReviewCity', plateCode: 916 } })
  cityId = city.id
  const category = await prisma.category.create({ data: { sortOrder: 94 } })
  const product = await prisma.product.create({
    data: { categoryId: category.id, basisType: 'AREA_M2' },
  })
  productId = product.id

  const customer = await prisma.user.create({
    data: { email: 'review-customer@example.com', fullName: 'Yorum Müşterisi' },
  })
  customerId = customer.id

  const admin = await prisma.user.create({
    data: { email: 'review-admin@example.com', fullName: 'Moderatör', globalRole: 'ADMIN' },
  })
  adminId = admin.id

  const company = await prisma.company.create({
    data: {
      slug: 'review-co',
      legalName: 'Review Co A.Ş.',
      displayName: 'Review Co',
      status: 'VERIFIED',
      verifiedAt: new Date(),
    },
  })
  companyId = company.id

  const owner = await prisma.user.create({
    data: { email: 'review-owner@example.com', fullName: 'Yorum Sahibi' },
  })
  ownerId = owner.id
  await prisma.companyMembership.create({
    data: { userId: ownerId, companyId, role: 'OWNER', acceptedAt: new Date() },
  })
}, 120_000)

describe('16 · eligibility and the one-review UNIQUE', () => {
  it('refuses before SURVEY_COMPLETED and accepts from it', async () => {
    const pendingId = await requestInStatus('ACCEPTED')
    const early = await submitReview(customerActor(), reviewInput(pendingId))
    expect(early.ok).toBe(false)
    if (!early.ok) expect(early.error.kind).toBe('PRECONDITION')

    const eligibility = await getReviewEligibility(customerActor(), {
      offerRequestId: pendingId,
    })
    expect(eligibility.ok && eligibility.value.reason).toBe('survey-not-completed')

    const surveyedId = await requestInStatus('SURVEY_COMPLETED')
    const submitted = await submitReview(customerActor(), reviewInput(surveyedId))
    expect(submitted.ok).toBe(true)
    if (submitted.ok) expect(submitted.value.status).toBe('PENDING')

    const second = await submitReview(customerActor(), reviewInput(surveyedId))
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error.kind).toBe('CONFLICT')
  }, 60_000)

  it('caps a customer at two reviews of the same company in 12 months', async () => {
    const prisma = getPrisma()
    const heavy = await prisma.user.create({
      data: { email: 'review-heavy@example.com', fullName: 'Sık Yorumcu' },
    })
    const heavyActor = (): ActorContext =>
      anonymousActor({ userId: heavy.id, globalRole: 'CUSTOMER', ip: '203.0.113.43' })

    for (let index = 0; index < 2; index += 1) {
      const requestId = await requestInStatus('SURVEY_COMPLETED', { customerId: heavy.id })
      const result = await submitReview(heavyActor(), reviewInput(requestId))
      expect(result.ok).toBe(true)
    }

    const thirdRequest = await requestInStatus('SURVEY_COMPLETED', { customerId: heavy.id })
    const third = await submitReview(heavyActor(), reviewInput(thirdRequest))
    expect(third.ok).toBe(false)
    if (!third.ok) expect(third.error.kind).toBe('PRECONDITION')
  }, 60_000)
})

describe('16 · moderation makes visibility AND aggregates', () => {
  it('an unmoderated review appears in no listing', async () => {
    const requestId = await requestInStatus('SURVEY_COMPLETED')
    const submitted = await submitReview(customerActor(), reviewInput(requestId))
    expect(submitted.ok).toBe(true)
    if (!submitted.ok) return

    const listed = await listPublishedReviewsAsCompany(companyActor(), {})
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.value.map((review) => review.id)).not.toContain(submitted.value.id)
  }, 60_000)

  it('an unmoderated review does not enter the average', async () => {
    // Everything PENDING so far — the aggregate must see zero of it.
    const outcome = await runAnalyticsRefresh(companyId)
    expect(outcome.status).toBe('refreshed')
    expect(outcome.reviewCount).toBe(0)
    expect(outcome.ratingSum).toBe(0)

    const company = await getPrisma().company.findUniqueOrThrow({ where: { id: companyId } })
    expect(company.reviewCount).toBe(0)
    expect(company.ratingSum).toBe(0)
  }, 60_000)

  it('publish → visible, in the aggregate, and the manufacturer notified; reject → author notified', async () => {
    const prisma = getPrisma()

    const toPublish = await prisma.review.findFirstOrThrow({
      where: { companyId, status: 'PENDING', customerId },
      orderBy: { createdAt: 'asc' },
    })
    const published = await moderateReview(adminActor(), {
      reviewId: toPublish.id,
      decision: 'PUBLISHED',
    })
    expect(published.ok).toBe(true)

    const listed = await listPublishedReviewsAsCompany(companyActor(), {})
    expect(listed.ok && listed.value.map((review) => review.id)).toContain(toPublish.id)

    expect(
      await prisma.notification.count({
        where: {
          userId: ownerId,
          type: 'review_published',
          payload: { path: ['reviewId'], equals: toPublish.id },
        },
      }),
    ).toBe(1)

    const toReject = await prisma.review.findFirstOrThrow({
      where: { companyId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    })
    const rejected = await moderateReview(adminActor(), {
      reviewId: toReject.id,
      decision: 'REJECTED',
      reason: 'Üçüncü kişilere ait kişisel veri içeriyor',
    })
    expect(rejected.ok).toBe(true)

    expect(
      await prisma.notification.count({
        where: {
          userId: toReject.customerId,
          type: 'review_rejected',
          payload: { path: ['reviewId'], equals: toReject.id },
        },
      }),
    ).toBe(1)

    // A rejected review never becomes visible.
    const after = await listPublishedReviewsAsCompany(companyActor(), {})
    expect(after.ok && after.value.map((review) => review.id)).not.toContain(toReject.id)

    // Moderation is an audited admin decision.
    expect(
      await prisma.auditLog.count({
        where: { entityType: 'Review', action: { in: ['review_published', 'review_rejected'] } },
      }),
    ).toBeGreaterThanOrEqual(2)
  }, 60_000)

  it('one response per review, and the customer hears about it', async () => {
    const prisma = getPrisma()
    const published = await prisma.review.findFirstOrThrow({
      where: { companyId, status: 'PUBLISHED' },
    })

    const first = await respondToReview(companyActor(), {
      reviewId: published.id,
      body: 'Değerlendirmeniz için teşekkürler.',
    })
    expect(first.ok).toBe(true)

    const second = await respondToReview(companyActor(), {
      reviewId: published.id,
      body: 'Bir kez daha teşekkürler.',
    })
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error.kind).toBe('CONFLICT')

    expect(
      await prisma.notification.count({
        where: {
          userId: published.customerId,
          type: 'review_responded',
          payload: { path: ['reviewId'], equals: published.id },
        },
      }),
    ).toBe(1)
  }, 60_000)
})

describe('7.3 · the aggregate equals an independent recompute', () => {
  it('matches source-derived numbers and is idempotent', async () => {
    const prisma = getPrisma()

    // A handful of response latencies for the median.
    for (const minutes of [30, 90, 240]) {
      await requestInStatus('DECLINED', { responseMinutes: minutes })
    }

    const first = await runAnalyticsRefresh(companyId)
    expect(first.status).toBe('refreshed')
    const second = await runAnalyticsRefresh(companyId)
    expect(second).toEqual({ ...first })

    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })

    // ── the independent recompute, straight SQL/ORM in the test ──────────────
    const publishedReviews = await prisma.review.findMany({
      where: { companyId, status: 'PUBLISHED', deletedAt: null },
      select: { ratingOverall: true },
    })
    const expectedSum = publishedReviews.reduce((sum, review) => sum + review.ratingOverall, 0)
    expect(company.ratingSum).toBe(expectedSum)
    expect(company.reviewCount).toBe(publishedReviews.length)
    expect(company.reviewCount).toBeGreaterThan(0)

    const responded = await prisma.offerRequest.findMany({
      where: { companyId, respondedAt: { not: null } },
      select: { createdAt: true, respondedAt: true },
    })
    const minutes = responded
      .map((row) => (row.respondedAt!.getTime() - row.createdAt.getTime()) / 60_000)
      .sort((a, b) => a - b)
    const mid = minutes.length / 2
    const expectedMedian =
      minutes.length % 2 === 1 ? minutes[Math.floor(mid)]! : (minutes[mid - 1]! + minutes[mid]!) / 2
    expect(company.medianResponseMinutes).toBe(Math.round(expectedMedian))

    const expectedCompleted = await prisma.offerRequest.count({
      where: {
        companyId,
        status: {
          in: ['SURVEY_COMPLETED', 'OFFER_SENT', 'OFFER_ACCEPTED', 'OFFER_REJECTED', 'WON', 'LOST'],
        },
      },
    })
    expect(company.completedEngagements).toBe(expectedCompleted)
  }, 60_000)

  it('a reviewless company keeps sum 0 / count 0 — the Bayesian prior case', async () => {
    const prisma = getPrisma()
    const bare = await prisma.company.create({
      data: {
        slug: 'review-bare',
        legalName: 'Bare Co A.Ş.',
        displayName: 'Bare Co',
        status: 'VERIFIED',
      },
    })

    const outcome = await runAnalyticsRefresh(bare.id)
    expect(outcome.status).toBe('refreshed')
    expect(outcome.ratingSum).toBe(0)
    expect(outcome.reviewCount).toBe(0)
    expect(outcome.medianResponseMinutes).toBeNull()
  }, 60_000)

  it('the rating CHECK refuses out-of-range values at the table', async () => {
    const requestId = await requestInStatus('SURVEY_COMPLETED')
    await expect(
      getPrisma().review.create({
        data: {
          offerRequestId: requestId,
          companyId,
          customerId,
          ratingOverall: 6,
          ratingQuality: 4,
          ratingCommunication: 4,
          ratingTimeliness: 4,
          body: REVIEW_BODY,
        },
      }),
    ).rejects.toThrow()
  }, 60_000)
})
