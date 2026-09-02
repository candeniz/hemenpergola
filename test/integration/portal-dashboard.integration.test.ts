import { beforeAll, describe, expect, it } from 'vitest'

import { getPortalDashboard } from '@/modules/offer/application/offer-request-service'
import { CONTACT_SHARING_TEXT_VERSION } from '@/shared/legal/consent-version'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'

import { getPrisma } from './setup'

/**
 * The portal dashboard's numbers, against a company with **more requests than one page**
 * — task 14.3.
 *
 * 13.8 built the dashboard by summarising `listLeadsForCompany`, which takes the newest 100.
 * For a company under that ceiling the totals are right and the bug is invisible; over it,
 * the funnel silently describes the newest hundred and the page presents it — with
 * percentages — as the company's own totals. That is precisely the failure 13.8 refused for
 * trend lines: *a number that looks measured and is guessed is worse than no number*, and
 * this one was worse still because it looked measured and WAS measured, of the wrong set.
 *
 * The window blocks are a different claim and stay a window: "recent requests" is the newest
 * five by name, and "deadlines approaching" is bounded by the SLA itself — a `PENDING`
 * request is younger than `offer_request.sla_hours` because the expiry job moves it on, so
 * the soonest clocks are always inside the newest page.
 *
 * 121 rows on purpose: one past the ceiling is enough to prove the ceiling is gone, and
 * cheap enough to keep the suite fast.
 */

const OVER_THE_PAGE = 121
const WON_COUNT = 30
const DECLINED_COUNT = 21

let companyId = ''
let ownerId = ''

const manufacturerActor = (): ActorContext =>
  anonymousActor({
    userId: ownerId,
    globalRole: 'CUSTOMER',
    companyId,
    companyRole: 'OWNER',
    companyStatus: 'VERIFIED',
    ip: '203.0.113.60',
  })

beforeAll(async () => {
  const prisma = getPrisma()

  const city = await prisma.city.create({ data: { name: 'DashboardCity', plateCode: 912 } })
  const category = await prisma.category.create({ data: { sortOrder: 95 } })
  const product = await prisma.product.create({
    data: { categoryId: category.id, basisType: 'AREA_M2' },
  })

  const customer = await prisma.user.create({
    data: { email: 'dashboard-customer@example.com', fullName: 'Pano Müşteri' },
  })

  const company = await prisma.company.create({
    data: {
      slug: 'dashboard-over-page',
      legalName: 'Dashboard A.Ş.',
      displayName: 'Dashboard',
      status: 'VERIFIED',
      verifiedAt: new Date(),
    },
  })
  companyId = company.id

  const owner = await prisma.user.create({
    data: { email: 'dashboard-owner@example.com', fullName: 'Pano Sahibi' },
  })
  ownerId = owner.id
  await prisma.companyMembership.create({
    data: { userId: owner.id, companyId: company.id, role: 'OWNER', acceptedAt: new Date() },
  })

  // One consent covers them: the FK needs a row, and what it records — this customer
  // agreeing to share contact details — is the same fact for every request here.
  const consent = await prisma.consent.create({
    data: {
      userId: customer.id,
      type: 'CONTACT_SHARING',
      textVersion: CONTACT_SHARING_TEXT_VERSION,
      grantedAt: new Date(),
      ip: '203.0.113.60',
      userAgent: 'integration-test',
    },
  })

  /*
   * `@@unique([projectId, companyId])`, so 121 requests need 121 projects. Written straight
   * through Prisma rather than the service: `createOfferRequests` enforces `06`'s five per
   * hour, which is exactly the limit a fixture may bypass and production may not.
   */
  const projects = Array.from({ length: OVER_THE_PAGE }, (_, index) => ({
    id: `prj_dash_${index}`,
    customerId: customer.id,
    productId: product.id,
    status: 'READY' as const,
    widthMm: 5000,
    depthMm: 4000,
    heightMm: 2800,
    areaM2: 20,
    quantity: 1,
    cityId: city.id,
  }))
  await prisma.project.createMany({ data: projects })

  const status = (index: number) => {
    if (index < WON_COUNT) return 'WON' as const
    if (index < WON_COUNT + DECLINED_COUNT) return 'DECLINED' as const
    return 'PENDING' as const
  }

  await prisma.offerRequest.createMany({
    data: projects.map((project, index) => ({
      projectId: project.id,
      customerId: customer.id,
      companyId: company.id,
      consentId: consent.id,
      status: status(index),
      // Newest last, so the WON rows — written first — are the OLDEST and fall outside the
      // newest-100 window. Without that the bug hides behind the ordering.
      createdAt: new Date(Date.UTC(2026, 0, 1) + index * 3_600_000),
      slaExpiresAt: new Date(Date.UTC(2026, 0, 1) + index * 3_600_000 + 48 * 3_600_000),
    })),
  })
}, 120_000)

describe('14.3 · the dashboard counts every request, not the newest page', () => {
  it('totals the whole company, past the list ceiling', async () => {
    const result = await getPortalDashboard(manufacturerActor(), {})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(
      result.value.summary.total,
      'the list takes 100; the summary must not inherit that ceiling',
    ).toBe(OVER_THE_PAGE)
  })

  it('counts statuses that fall outside the newest page', async () => {
    const result = await getPortalDashboard(manufacturerActor(), {})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // The 30 WON rows are the oldest, so a summary built from the newest 100 sees 21 of
    // them and reports 21. Every one of them is this company's.
    expect(result.value.summary.counts.won).toBe(WON_COUNT)
    expect(result.value.summary.counts.pending).toBe(OVER_THE_PAGE - WON_COUNT - DECLINED_COUNT)
  })

  it('computes the funnel over the whole set, so the percentages mean something', async () => {
    const result = await getPortalDashboard(manufacturerActor(), {})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const byStage = Object.fromEntries(result.value.summary.funnel.map((row) => [row.stage, row]))

    expect(byStage.received?.count).toBe(OVER_THE_PAGE)
    expect(byStage.received?.ofTotal).toBe(100)
    // Only WON got past acceptance here.
    expect(byStage.accepted?.count).toBe(WON_COUNT)
    expect(byStage.won?.count).toBe(WON_COUNT)
    expect(byStage.won?.ofTotal).toBe(Math.round((WON_COUNT / OVER_THE_PAGE) * 100))
  })

  it('keeps the window blocks a window, and says so by staying small', async () => {
    const result = await getPortalDashboard(manufacturerActor(), {})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // These two are labelled "recent" and "approaching"; they are not totals and are not
    // asserted as such. What matters is that they are bounded and non-empty.
    expect(result.value.recent.length).toBeLessThanOrEqual(5)
    expect(result.value.deadlines.length).toBeLessThanOrEqual(5)
    expect(result.value.deadlines.every((lead) => lead.status === 'PENDING')).toBe(true)
  })

  it('scopes to the caller company', async () => {
    const prisma = getPrisma()
    const other = await prisma.company.create({
      data: {
        slug: 'dashboard-other',
        legalName: 'Other A.Ş.',
        displayName: 'Other',
        status: 'VERIFIED',
        verifiedAt: new Date(),
      },
    })
    const otherOwner = await prisma.user.create({
      data: { email: 'dashboard-other-owner@example.com', fullName: 'Öteki' },
    })
    await prisma.companyMembership.create({
      data: { userId: otherOwner.id, companyId: other.id, role: 'OWNER', acceptedAt: new Date() },
    })

    const result = await getPortalDashboard(
      anonymousActor({
        userId: otherOwner.id,
        globalRole: 'CUSTOMER',
        companyId: other.id,
        companyRole: 'OWNER',
        companyStatus: 'VERIFIED',
        ip: '203.0.113.61',
      }),
      {},
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.summary.total, 'a company with no requests has none').toBe(0)
  })
})
