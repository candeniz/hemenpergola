/**
 * The public-directory contract (`06` §Public read, `07` §Route map), extracted from
 * `directory-service.ts` in Phase 11.2. All types, no schemas: every directory read takes
 * a slug and/or a locale, shapes too small to earn a Zod object — the contract here is
 * what comes BACK. Runtime-pure, pinned by `dto-purity.test.ts`.
 */

export type PublicCategory = {
  slug: string
  name: string
  description: string | null
  productCount: number
}

export type PublicCategoryDetail =
  | { kind: 'found'; category: PublicCategory; products: PublicProductCard[] }
  | { kind: 'moved'; slug: string }

export type PublicProductCard = {
  slug: string
  name: string
  shortDescription: string | null
}

export type PublicProductDetail =
  | {
      kind: 'found'
      product: {
        slug: string
        name: string
        shortDescription: string | null
        description: string | null
        category: { slug: string; name: string } | null
        attributes: { name: string; options: string[] }[]
      }
    }
  | { kind: 'moved'; slug: string }

export type PublicManufacturerCard = {
  slug: string
  displayName: string
  about: string | null
  /** Null below three published reviews (`16` §Aggregates) — "new on the platform". */
  avgRating: number | null
  reviewCount: number
  cityNames: string[]
}

export type PublicSlugs = {
  categories: { locale: string; slug: string }[]
  products: { locale: string; slug: string }[]
  companies: { slug: string }[]
}

export type PublicManufacturerProfile = {
  card: PublicManufacturerCard
  foundedYear: number | null
  employeeRange: string | null
  portfolio: { title: string; description: string | null; completedAt: Date | null }[]
  reviews: {
    ratingOverall: number
    title: string | null
    body: string
    publishedAt: Date | null
    response: { body: string; createdAt: Date } | null
  }[]
}

export type PublicCity = { slug: string; name: string; manufacturerCount: number }

export type PublicCityDetail = {
  city: PublicCity
  manufacturers: PublicManufacturerCard[]
}
