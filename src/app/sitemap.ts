import type { MetadataRoute } from 'next'

import { absoluteUrl, localePath } from '@/shared/seo/site-url'

/**
 * The sitemap — task 8.4's first half, covering exactly the pages 8.1 built. URLs come
 * from `NEXT_PUBLIC_SITE_URL` (the domain is undecided; nothing hardcodes one) and slugs
 * from the directory service's `listPublicSlugs` — no database client in `app/`
 * (`05` §Shape), and the same build-time fallback the public pages use: `next build` has
 * no environment (`23` §Configuration), so the prerendered sitemap carries the static
 * routes and the runtime revalidation adds the catalogue.
 */
export const revalidate = 3600

const LOCALES = ['tr', 'en'] as const

function entry(path: string, priority: number): MetadataRoute.Sitemap {
  return LOCALES.map((locale) => ({
    url: absoluteUrl(localePath(locale, path)),
    changeFrequency: 'weekly',
    priority,
  }))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    ...entry('/', 1),
    ...entry('/kategoriler', 0.8),
    ...entry('/ureticiler', 0.8),
    ...entry('/sehirler', 0.8),
    ...entry('/proje/yeni', 0.9),
    // The CMS launch pages (8.3) — static routes, content from the database.
    ...entry('/nasil-calisir', 0.6),
    ...entry('/hakkimizda', 0.5),
    ...entry('/iletisim', 0.5),
  ]

  try {
    const { listPublicSlugs, listPublicCities } =
      await import('@/modules/directory/application/directory-service')
    const { anonymousActor } = await import('@/shared/context/actor')

    const cities = await listPublicCities(anonymousActor(), {})
    if (cities.ok) {
      // Only supplied cities exist as pages (8.2), so only they enter the sitemap.
      for (const city of cities.value) {
        for (const locale of LOCALES) {
          entries.push({
            url: absoluteUrl(localePath(locale, `/sehirler/${city.slug}`)),
            changeFrequency: 'weekly',
            priority: 0.7,
          })
        }
      }
    }

    const result = await listPublicSlugs(anonymousActor(), {})
    if (!result.ok) return entries

    for (const category of result.value.categories) {
      entries.push({
        url: absoluteUrl(localePath(category.locale, `/kategoriler/${category.slug}`)),
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    }
    for (const product of result.value.products) {
      entries.push({
        url: absoluteUrl(localePath(product.locale, `/urunler/${product.slug}`)),
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    }
    for (const company of result.value.companies) {
      for (const locale of LOCALES) {
        entries.push({
          url: absoluteUrl(localePath(locale, `/ureticiler/${company.slug}`)),
          changeFrequency: 'weekly',
          priority: 0.6,
        })
      }
    }
  } catch {
    // Build-time prerender without a database: the static routes above still ship.
  }

  return entries
}
