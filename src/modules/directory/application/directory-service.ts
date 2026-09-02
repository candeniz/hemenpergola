import 'server-only'

import { prisma } from '@/shared/db'
import { err, notFound, ok } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'
import { resolveSlugRedirect } from '@/shared/slug-redirect'
import { slugify } from '@/shared/text/slug'

/**
 * The public directory — task 8.1, `07` §Route map's public half. Every method here is
 * `anonymous` and PINNED in the authorisation-matrix suite (`DIRECTORY_PUBLIC_READ`, the
 * `MATCHING_PUBLIC_READ` discipline): read-only, `get*`/`list*` shapes, and a new
 * anonymous method is a reviewed diff, not a drift.
 *
 * Slug lookups are two-step (`18` §URLs, task 8.5): the current slug first, then the
 * `SlugRedirect` table — a miss that finds a redirect returns `{ kind: 'moved' }` with
 * the CURRENT slug and the page answers with a permanent redirect, never a 404.
 *
 * **The three-review rule lives here, not in the page** (`16` §Aggregates): `avgRating`
 * is `null` until three PUBLISHED reviews exist, however full the denormalised columns
 * are — the DTO boundary is the control, the same construction as the lead DTOs.
 */

const MIN_REVIEWS_FOR_AVERAGE = 3

type Locale = 'tr' | 'en'

const localeOf = (value: string): Locale => (value === 'en' ? 'en' : 'tr')

// The contract lives in ./dto (extracted in 11.2).
export * from './dto'

import {
  type PublicCategory,
  type PublicCategoryDetail,
  type PublicCity,
  type PublicCityDetail,
  type PublicManufacturerCard,
  type PublicManufacturerProfile,
  type PublicProductDetail,
  type PublicSlugs,
} from './dto'

// ── categories ────────────────────────────────────────────────────────────────

export const listPublicCategories = serviceMethod<{ locale: string }, PublicCategory[]>(
  'directory',
  'listPublicCategories',
  { kind: 'anonymous', why: 'the category grid is the public homepage (07 §Route map)' },
  async (_actor, input) => {
    const locale = localeOf(input.locale)
    const rows = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        translations: { where: { locale }, select: { slug: true, name: true, description: true } },
        _count: { select: { products: { where: { isActive: true } } } },
      },
    })

    return ok(
      rows
        .map((row) => {
          const translation = row.translations[0]
          if (translation === undefined) return null
          return {
            slug: translation.slug,
            name: translation.name,
            description: translation.description,
            productCount: row._count.products,
          }
        })
        .filter((row): row is PublicCategory => row !== null),
    )
  },
)

export const getPublicCategory = serviceMethod<
  { locale: string; slug: string },
  PublicCategoryDetail
>(
  'directory',
  'getPublicCategory',
  { kind: 'anonymous', why: 'a category page is a public canonical URL (07 §Route map)' },
  async (_actor, input) => {
    const locale = localeOf(input.locale)

    const load = async (where: { slug: string } | { categoryId: string }) =>
      prisma.categoryTranslation.findFirst({
        where: { locale, ...where, category: { isActive: true } },
        select: {
          slug: true,
          name: true,
          description: true,
          category: {
            select: {
              id: true,
              products: {
                where: { isActive: true },
                orderBy: { sortOrder: 'asc' },
                select: {
                  translations: {
                    where: { locale },
                    select: { slug: true, name: true, shortDescription: true },
                  },
                },
              },
            },
          },
        },
      })

    let row = await load({ slug: input.slug })

    if (row === null) {
      const entityId = await resolveSlugRedirect('category', locale, input.slug)
      if (entityId === null) return err(notFound('Category'))
      row = await load({ categoryId: entityId })
      if (row === null) return err(notFound('Category'))
      return ok({ kind: 'moved' as const, slug: row.slug })
    }

    return ok({
      kind: 'found' as const,
      category: {
        slug: row.slug,
        name: row.name,
        description: row.description,
        productCount: row.category.products.length,
      },
      products: row.category.products
        .map((product) => product.translations[0])
        .filter(
          (translation): translation is NonNullable<typeof translation> =>
            translation !== undefined,
        )
        .map((translation) => ({
          slug: translation.slug,
          name: translation.name,
          shortDescription: translation.shortDescription,
        })),
    })
  },
)

// ── products ──────────────────────────────────────────────────────────────────

export const getPublicProduct = serviceMethod<
  { locale: string; slug: string },
  PublicProductDetail
>(
  'directory',
  'getPublicProduct',
  { kind: 'anonymous', why: 'a product page is a public canonical URL (07 §Route map)' },
  async (_actor, input) => {
    const locale = localeOf(input.locale)

    const load = async (where: { slug: string } | { productId: string }) =>
      prisma.productTranslation.findFirst({
        where: { locale, ...where, product: { isActive: true } },
        select: {
          slug: true,
          name: true,
          shortDescription: true,
          description: true,
          product: {
            select: {
              id: true,
              category: {
                select: { translations: { where: { locale }, select: { slug: true, name: true } } },
              },
              attributes: {
                orderBy: { sortOrder: 'asc' },
                select: {
                  translations: { where: { locale }, select: { label: true } },
                  options: {
                    orderBy: { sortOrder: 'asc' },
                    select: { translations: { where: { locale }, select: { label: true } } },
                  },
                },
              },
            },
          },
        },
      })

    let row = await load({ slug: input.slug })

    if (row === null) {
      const entityId = await resolveSlugRedirect('product', locale, input.slug)
      if (entityId === null) return err(notFound('Product'))
      row = await load({ productId: entityId })
      if (row === null) return err(notFound('Product'))
      return ok({ kind: 'moved' as const, slug: row.slug })
    }

    const categoryTranslation = row.product.category?.translations[0] ?? null

    return ok({
      kind: 'found' as const,
      product: {
        slug: row.slug,
        name: row.name,
        shortDescription: row.shortDescription,
        description: row.description,
        category:
          categoryTranslation === null
            ? null
            : { slug: categoryTranslation.slug, name: categoryTranslation.name },
        attributes: row.product.attributes
          .map((attribute) => ({
            name: attribute.translations[0]?.label ?? '',
            options: attribute.options
              .map((option) => option.translations[0]?.label ?? '')
              .filter((label) => label !== ''),
          }))
          .filter((attribute) => attribute.name !== ''),
      },
    })
  },
)

// ── manufacturers ─────────────────────────────────────────────────────────────

function averageOrNull(ratingSum: number, reviewCount: number): number | null {
  if (reviewCount < MIN_REVIEWS_FOR_AVERAGE) return null
  return Math.round((ratingSum / reviewCount) * 10) / 10
}

const MANUFACTURER_CARD_SELECT = {
  slug: true,
  displayName: true,
  about: true,
  ratingSum: true,
  reviewCount: true,
  serviceAreas: {
    where: { isActive: true },
    select: { city: { select: { name: true } } },
  },
} as const

function toCard(row: {
  slug: string
  displayName: string
  about: string | null
  ratingSum: number
  reviewCount: number
  serviceAreas: { city: { name: string } | null }[]
}): PublicManufacturerCard {
  return {
    slug: row.slug,
    displayName: row.displayName,
    about: row.about,
    avgRating: averageOrNull(row.ratingSum, row.reviewCount),
    reviewCount: row.reviewCount,
    cityNames: [
      ...new Set(
        row.serviceAreas
          .map((area) => area.city?.name)
          .filter((name): name is string => name !== undefined && name !== null),
      ),
    ],
  }
}

/**
 * **What the site is willing to call supply** — one definition, task 14.4.
 *
 * `VERIFIED` alone is not enough. `09` §1 makes a `ServiceArea` a *hard* eligibility filter:
 * a verified company that covers nowhere can never be a match candidate, so a directory card
 * for it is a road that ends — the customer clicks a manufacturer who is structurally unable
 * to quote them.
 *
 * `18`'s city pages have used exactly this criterion since Phase 8 ("the count of city pages
 * is READ FROM SUPPLY"); the directory used the looser one, and the two disagreed. Two
 * definitions of supply in one codebase is the drift this repository keeps closing, so there
 * is now one constant and `SUPPLIED_CITY_WHERE` is expressed in terms of it.
 *
 * The **profile** page deliberately does not apply it: `/ureticiler/[slug]` is a real page
 * about a real verified company, and refusing a direct link would 404 something that exists.
 * What changes is whether the site *advertises* it — the directory and the sitemap.
 */
const LISTABLE_COMPANY = {
  status: 'VERIFIED' as const,
  deletedAt: null,
} as const

/** Reachable through an active coverage row — the half `09` §1 makes a hard filter. */
const HAS_COVERAGE = { serviceAreas: { some: { isActive: true } } } as const

const LISTABLE_COMPANY_WHERE = { ...LISTABLE_COMPANY, ...HAS_COVERAGE } as const

/**
 * The same predicate written from the **other end of the relation** — for queries that start
 * at a `City` or a `ServiceArea` and ask about the company.
 *
 * Derived rather than retyped (task 14.5). Four copies of `status: 'VERIFIED'` used to sit in
 * this file, two of them hand-written, and they agreed only because nobody had changed the
 * rule yet. Adding a term to `LISTABLE_COMPANY` — the suspension `ADR-031` anticipates — would
 * have moved the directory and left the city count and the city detail on the old rule:
 * `/sehirler` saying "3 ÜRETİCİ" over a page listing two.
 */
const LISTABLE_COMPANY_FROM_SERVICE_AREA = { isActive: true, company: LISTABLE_COMPANY } as const

export const listPublicManufacturers = serviceMethod<
  Record<string, never>,
  PublicManufacturerCard[]
>(
  'directory',
  'listPublicManufacturers',
  { kind: 'anonymous', why: 'the manufacturer directory is a public page (07 §Route map)' },
  async () => {
    const rows = await prisma.company.findMany({
      where: LISTABLE_COMPANY_WHERE,
      orderBy: [{ reviewCount: 'desc' }, { displayName: 'asc' }],
      select: MANUFACTURER_CARD_SELECT,
    })
    return ok(rows.map(toCard))
  },
)

// ── sitemap feed ──────────────────────────────────────────────────────────────

export const listPublicSlugs = serviceMethod<Record<string, never>, PublicSlugs>(
  'directory',
  'listPublicSlugs',
  { kind: 'anonymous', why: 'the sitemap enumerates exactly the public canonical URLs (18)' },
  async () => {
    const [categories, products, companies] = await Promise.all([
      prisma.categoryTranslation.findMany({
        where: { category: { isActive: true } },
        select: { locale: true, slug: true },
      }),
      prisma.productTranslation.findMany({
        where: { product: { isActive: true } },
        select: { locale: true, slug: true },
      }),
      prisma.company.findMany({
        // The sitemap advertises the same set the directory lists — a URL offered to a
        // crawler that the site itself will not link is the inconsistency one layer out.
        where: LISTABLE_COMPANY_WHERE,
        select: { slug: true },
      }),
    ])
    return ok({
      categories: categories.map((row) => ({ locale: row.locale, slug: row.slug })),
      products: products.map((row) => ({ locale: row.locale, slug: row.slug })),
      companies: companies.map((row) => ({ slug: row.slug })),
    })
  },
)

export const getPublicManufacturer = serviceMethod<{ slug: string }, PublicManufacturerProfile>(
  'directory',
  'getPublicManufacturer',
  { kind: 'anonymous', why: 'a manufacturer profile is a public canonical URL (07 §Route map)' },
  async (_actor, input) => {
    const row = await prisma.company.findFirst({
      // `LISTABLE_COMPANY` without `HAS_COVERAGE`: the profile is deliberately outside the
      // listing rule (a direct link to a real company must work), but the half about which
      // companies exist publicly is the same one, derived rather than retyped.
      where: { slug: input.slug, ...LISTABLE_COMPANY },
      select: {
        ...MANUFACTURER_CARD_SELECT,
        foundedYear: true,
        employeeRange: true,
        portfolio: {
          orderBy: { sortOrder: 'asc' },
          select: { title: true, description: true, completedAt: true },
        },
        companyReviews: {
          where: { status: 'PUBLISHED', deletedAt: null },
          orderBy: { publishedAt: 'desc' },
          select: {
            ratingOverall: true,
            title: true,
            body: true,
            publishedAt: true,
            response: { select: { body: true, createdAt: true } },
          },
        },
      },
    })
    if (row === null) return err(notFound('Company'))

    return ok({
      card: toCard(row),
      foundedYear: row.foundedYear,
      employeeRange: row.employeeRange,
      portfolio: row.portfolio.map((item) => ({
        title: item.title,
        description: item.description,
        completedAt: item.completedAt,
      })),
      // Field-by-field pick: never the customer's identity — a public review is the text
      // and the score, not who wrote it.
      reviews: row.companyReviews.map((review) => ({
        ratingOverall: review.ratingOverall,
        title: review.title,
        body: review.body,
        publishedAt: review.publishedAt,
        response:
          review.response === null
            ? null
            : { body: review.response.body, createdAt: review.response.createdAt },
      })),
    })
  },
)

// ── city landing pages (task 8.2) ─────────────────────────────────────────────

/**
 * The supply predicate IS the page-existence rule: a city page exists only where an
 * active service area of a VERIFIED, undeleted company points. 81 provinces ×
 * products with nothing behind them is the doorway-page pattern search engines punish
 * (`18`) — so an unsupplied city is a 404, not a thin page, and the count of city pages
 * is READ FROM SUPPLY, never from a launch list that goes stale (Q5).
 */
const SUPPLIED_CITY_WHERE = {
  serviceAreas: {
    some: {
      isActive: true,
      // The same predicate the directory applies, read from the other end of the relation.
      company: {
        status: LISTABLE_COMPANY_WHERE.status,
        deletedAt: LISTABLE_COMPANY_WHERE.deletedAt,
      },
    },
  },
} as const

export const listPublicCities = serviceMethod<Record<string, never>, PublicCity[]>(
  'directory',
  'listPublicCities',
  { kind: 'anonymous', why: 'city landing pages exist only where real supply exists (18, Q5)' },
  async () => {
    const rows = await prisma.city.findMany({
      where: SUPPLIED_CITY_WHERE,
      orderBy: { plateCode: 'asc' },
      select: {
        name: true,
        serviceAreas: {
          // The count under a city name and the list on its page must be the same set.
          where: LISTABLE_COMPANY_FROM_SERVICE_AREA,
          select: { companyId: true },
        },
      },
    })
    return ok(
      rows.map((row) => ({
        slug: slugify(row.name),
        name: row.name,
        manufacturerCount: new Set(row.serviceAreas.map((area) => area.companyId)).size,
      })),
    )
  },
)

export const getPublicCity = serviceMethod<{ slug: string }, PublicCityDetail>(
  'directory',
  'getPublicCity',
  { kind: 'anonymous', why: 'a supplied city landing page is a public canonical URL (18)' },
  async (_actor, input) => {
    // 81 rows: resolving slug→city by scanning is cheaper than storing a slug column for
    // names that never change.
    const cities = await prisma.city.findMany({
      where: SUPPLIED_CITY_WHERE,
      select: { id: true, name: true },
    })
    const city = cities.find((row) => slugify(row.name) === input.slug)
    if (city === undefined) return err(notFound('City'))

    const companies = await prisma.company.findMany({
      where: {
        ...LISTABLE_COMPANY,
        // Coverage of THIS city, which is `HAS_COVERAGE` narrowed rather than rewritten.
        serviceAreas: { some: { ...HAS_COVERAGE.serviceAreas.some, cityId: city.id } },
      },
      orderBy: [{ reviewCount: 'desc' }, { displayName: 'asc' }],
      select: MANUFACTURER_CARD_SELECT,
    })

    return ok({
      city: {
        slug: input.slug,
        name: city.name,
        manufacturerCount: companies.length,
      },
      manufacturers: companies.map(toCard),
    })
  },
)
