import { beforeAll, describe, expect, it } from 'vitest'

import { updateCategory } from '@/modules/catalog/application/catalog-service'
import {
  getPublicCategory,
  getPublicManufacturer,
  listPublicManufacturers,
  listPublicSlugs,
} from '@/modules/directory/application/directory-service'
import { runAnalyticsRefresh } from '@/modules/review/infrastructure/analytics-job'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'

import { getPrisma } from './setup'

/**
 * The public directory and the slug lifecycle — tasks 8.1 and 8.5.
 *
 * The two headline rules, each locked here:
 *
 *   - a changed slug never 404s: the old slug resolves through `SlugRedirect` to
 *     `{ kind: 'moved' }` with the CURRENT slug, chains collapse to one hop, and a slug
 *     returning to live use stops redirecting;
 *   - `avgRating` is `null` below three published reviews (`16` §Aggregates), however
 *     full the denormalised columns are — asserted against the DTO, because the DTO is
 *     what every page renders.
 */

const admin = (): ActorContext =>
  anonymousActor({ userId: 'usr_dir_admin', globalRole: 'ADMIN', ip: '203.0.113.50' })

const anonymous = (): ActorContext => anonymousActor({ ip: '203.0.113.51' })

let categoryId = ''

beforeAll(async () => {
  const prisma = getPrisma()
  const category = await prisma.category.create({
    data: {
      sortOrder: 92,
      translations: {
        create: [
          { locale: 'tr', slug: 'dizin-testi-sistemleri', name: 'Dizin Testi Sistemleri' },
          { locale: 'en', slug: 'directory-test-systems', name: 'Directory Test Systems' },
        ],
      },
    },
  })
  categoryId = category.id
}, 120_000)

describe('8.5 · a changed slug redirects, permanently', () => {
  it('answers the old slug with moved→current, collapses chains, and frees a reused slug', async () => {
    const first = await updateCategory(admin(), {
      categoryId,
      translations: {
        tr: { name: 'Dizin Testi Sistemleri', slug: 'dizin-testi-yeni' },
        en: { name: 'Directory Test Systems', slug: 'directory-test-new' },
      },
    })
    expect(first.ok).toBe(true)

    // The old slug answers as moved — with the CURRENT slug, not a 404.
    const moved = await getPublicCategory(anonymous(), {
      locale: 'tr',
      slug: 'dizin-testi-sistemleri',
    })
    expect(moved.ok && moved.value.kind).toBe('moved')
    if (moved.ok && moved.value.kind === 'moved') {
      expect(moved.value.slug).toBe('dizin-testi-yeni')
    }

    // Rename again: the FIRST old slug still resolves — to the newest, in one hop.
    const second = await updateCategory(admin(), {
      categoryId,
      translations: {
        tr: { name: 'Dizin Testi Sistemleri', slug: 'dizin-testi-son' },
        en: { name: 'Directory Test Systems', slug: 'directory-test-new' },
      },
    })
    expect(second.ok).toBe(true)

    const chained = await getPublicCategory(anonymous(), {
      locale: 'tr',
      slug: 'dizin-testi-sistemleri',
    })
    expect(chained.ok && chained.value.kind === 'moved' && chained.value.slug).toBe(
      'dizin-testi-son',
    )
    const hop = await getPublicCategory(anonymous(), { locale: 'tr', slug: 'dizin-testi-yeni' })
    expect(hop.ok && hop.value.kind === 'moved' && hop.value.slug).toBe('dizin-testi-son')

    // Reuse the very first slug: it goes LIVE again and its redirect row is gone.
    const back = await updateCategory(admin(), {
      categoryId,
      translations: {
        tr: { name: 'Dizin Testi Sistemleri', slug: 'dizin-testi-sistemleri' },
        en: { name: 'Directory Test Systems', slug: 'directory-test-new' },
      },
    })
    expect(back.ok).toBe(true)

    const live = await getPublicCategory(anonymous(), {
      locale: 'tr',
      slug: 'dizin-testi-sistemleri',
    })
    expect(live.ok && live.value.kind).toBe('found')

    expect(
      await getPrisma().slugRedirect.findFirst({
        where: { entityType: 'category', locale: 'tr', oldSlug: 'dizin-testi-sistemleri' },
      }),
    ).toBeNull()

    // The English set changed once (first update) and then held still: exactly one
    // redirect row, per locale — the sets are independent (`ADR-017`).
    const englishRedirects = await getPrisma().slugRedirect.findMany({
      where: { entityType: 'category', locale: 'en' },
    })
    expect(englishRedirects.map((row) => row.oldSlug)).toEqual(['directory-test-systems'])

    const englishMoved = await getPublicCategory(anonymous(), {
      locale: 'en',
      slug: 'directory-test-systems',
    })
    expect(englishMoved.ok && englishMoved.value.kind === 'moved' && englishMoved.value.slug).toBe(
      'directory-test-new',
    )
  }, 60_000)

  it('a slug nobody ever used is a plain NOT_FOUND', async () => {
    const missing = await getPublicCategory(anonymous(), {
      locale: 'tr',
      slug: 'hic-var-olmadi',
    })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.kind).toBe('NOT_FOUND')
  })
})

describe('8.1 · the three-review rule in the public DTO', () => {
  let companyId = ''
  let companySlug = ''

  async function publishedReview(overall: number): Promise<void> {
    const prisma = getPrisma()
    const customer = await prisma.user.create({
      data: {
        email: `dir-reviewer-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      },
    })
    const category = await prisma.category.findFirstOrThrow({ where: { id: categoryId } })
    const product =
      (await prisma.product.findFirst({ where: { categoryId: category.id } })) ??
      (await prisma.product.create({ data: { categoryId: category.id, basisType: 'AREA_M2' } }))
    const project = await prisma.project.create({
      data: { customerId: customer.id, productId: product.id, status: 'SUBMITTED', quantity: 1 },
    })
    const consent = await prisma.consent.create({
      data: {
        userId: customer.id,
        type: 'CONTACT_SHARING',
        textVersion: 'test.v1',
        ip: '203.0.113.52',
        userAgent: 'vitest',
      },
    })
    const request = await prisma.offerRequest.create({
      data: {
        projectId: project.id,
        customerId: customer.id,
        companyId,
        status: 'SURVEY_COMPLETED',
        slaExpiresAt: new Date(Date.now() + 48 * 3_600_000),
        respondedAt: new Date(),
        consentId: consent.id,
      },
    })
    await prisma.review.create({
      data: {
        offerRequestId: request.id,
        companyId,
        customerId: customer.id,
        ratingOverall: overall,
        ratingQuality: overall,
        ratingCommunication: overall,
        ratingTimeliness: overall,
        body: 'Keşif zamanında yapıldı, ekip titizdi, sonuç beklentimizi karşıladı. Teşekkür ederiz.',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    })
  }

  beforeAll(async () => {
    const company = await getPrisma().company.create({
      data: {
        slug: 'dizin-testi-uretici',
        legalName: 'Dizin Testi A.Ş.',
        displayName: 'Dizin Testi Üretici',
        status: 'VERIFIED',
        verifiedAt: new Date(),
      },
    })
    companyId = company.id
    companySlug = company.slug

    /*
     * A service area, because 14.4 made one the price of being listed: `09` §1 treats
     * coverage as a hard eligibility filter, so the directory and the sitemap now carry
     * companies that can actually serve somebody. This suite's subject is the three-review
     * rule and the sitemap's source, not supply — the coverage is a precondition it has to
     * meet, and `directory-supply.integration.test.ts` is where the rule itself is tested.
     */
    // Its own city: the integration database carries migrations and nothing else, so there
    // is none to borrow, and `plateCode` is unique across the suites that share it. 992 is
    // free — the others sit at 900–919 and 934–990.
    const city = await getPrisma().city.create({
      data: { name: 'DizinTestiŞehir', plateCode: 992 },
    })
    await getPrisma().serviceArea.create({
      data: { companyId: company.id, kind: 'CITY', cityId: city.id, isActive: true },
    })
  }, 120_000)

  it('hides the average below three published reviews, however full the columns are', async () => {
    await publishedReview(5)
    await publishedReview(4)
    await runAnalyticsRefresh(companyId)

    // The columns ARE full — two reviews, sum 9 — and the DTO still says null.
    const company = await getPrisma().company.findUniqueOrThrow({ where: { id: companyId } })
    expect(company.reviewCount).toBe(2)
    expect(company.ratingSum).toBe(9)

    const listed = await listPublicManufacturers(anonymous(), {})
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    const card = listed.value.find((row) => row.slug === companySlug)
    expect(card?.avgRating).toBeNull()
    expect(card?.reviewCount).toBe(2)

    const profile = await getPublicManufacturer(anonymous(), { slug: companySlug })
    expect(profile.ok && profile.value.card.avgRating).toBeNull()
  }, 60_000)

  it('shows the average from the third published review onward', async () => {
    await publishedReview(3)
    await runAnalyticsRefresh(companyId)

    const profile = await getPublicManufacturer(anonymous(), { slug: companySlug })
    expect(profile.ok).toBe(true)
    if (!profile.ok) return
    expect(profile.value.card.reviewCount).toBe(3)
    expect(profile.value.card.avgRating).toBe(4) // (5+4+3)/3
    // The public review DTO carries text and score, never the author.
    for (const review of profile.value.reviews) {
      expect(Object.keys(review).sort()).toEqual(
        ['body', 'publishedAt', 'ratingOverall', 'response', 'title'].sort(),
      )
    }
  }, 60_000)

  it('feeds the sitemap from the same public surface', async () => {
    const slugs = await listPublicSlugs(anonymous(), {})
    expect(slugs.ok).toBe(true)
    if (!slugs.ok) return
    expect(slugs.value.companies.map((row) => row.slug)).toContain(companySlug)
    expect(
      slugs.value.categories.some(
        (row) => row.locale === 'tr' && row.slug === 'dizin-testi-sistemleri',
      ),
    ).toBe(true)
  }, 60_000)
})

describe('8.2 · city pages exist only where real supply exists', () => {
  it('lists the supplied city, serves its page, and 404s the unsupplied one', async () => {
    const prisma = getPrisma()
    const { listPublicCities, getPublicCity } =
      await import('@/modules/directory/application/directory-service')

    // Supply: an active CITY service area of a VERIFIED company.
    const supplied = await prisma.city.create({ data: { name: 'Arzlı Şehir', plateCode: 917 } })
    await prisma.city.create({ data: { name: 'Arzsız Şehir', plateCode: 918 } })
    const company = await prisma.company.create({
      data: {
        slug: 'sehir-testi-uretici',
        legalName: 'Şehir Testi A.Ş.',
        displayName: 'Şehir Testi Üretici',
        status: 'VERIFIED',
        verifiedAt: new Date(),
      },
    })
    await prisma.serviceArea.create({
      data: { companyId: company.id, kind: 'CITY', cityId: supplied.id, isActive: true },
    })

    const cities = await listPublicCities(anonymous(), {})
    expect(cities.ok).toBe(true)
    if (!cities.ok) return
    const slugs = cities.value.map((city) => city.slug)
    expect(slugs).toContain('arzli-sehir')
    // The unsupplied city is NOT in the list — the doorway-page rule (18).
    expect(slugs).not.toContain('arzsiz-sehir')

    const page = await getPublicCity(anonymous(), { slug: 'arzli-sehir' })
    expect(page.ok).toBe(true)
    if (page.ok) {
      expect(page.value.manufacturers.map((m) => m.slug)).toContain('sehir-testi-uretici')
    }

    const missing = await getPublicCity(anonymous(), { slug: 'arzsiz-sehir' })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.kind).toBe('NOT_FOUND')
  }, 60_000)

  it('an inactive area or an unverified company creates no city page', async () => {
    const prisma = getPrisma()
    const { getPublicCity } = await import('@/modules/directory/application/directory-service')

    const city = await prisma.city.create({ data: { name: 'Pasif Şehir', plateCode: 919 } })
    const pendingCompany = await prisma.company.create({
      data: {
        slug: 'sehir-testi-pending',
        legalName: 'Pending A.Ş.',
        displayName: 'Pending Üretici',
        status: 'PENDING',
      },
    })
    // A PENDING company's area, and a VERIFIED company's INACTIVE area — neither counts.
    await prisma.serviceArea.create({
      data: { companyId: pendingCompany.id, kind: 'CITY', cityId: city.id, isActive: true },
    })
    const verified = await prisma.company.findFirstOrThrow({
      where: { slug: 'sehir-testi-uretici' },
    })
    await prisma.serviceArea.create({
      data: { companyId: verified.id, kind: 'CITY', cityId: city.id, isActive: false },
    })

    const missing = await getPublicCity(anonymous(), { slug: 'pasif-sehir' })
    expect(missing.ok).toBe(false)
  }, 60_000)
})
