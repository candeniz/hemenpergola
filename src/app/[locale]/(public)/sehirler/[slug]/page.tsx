import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { JsonLd } from '@/components/seo/json-ld'
import { PublicShell } from '@/components/layouts/public-shell'
import { Card, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { absoluteUrl, localePath } from '@/shared/seo/site-url'

import type { PublicCityDetail } from '@/modules/directory/application/directory-service'

/**
 * `/sehirler/[slug]` — task 8.2, the fifth main template (`18` §Performance budgets).
 *
 * **An unsupplied city is a 404, not a thin page**: the service applies the supply
 * predicate (active service area of a VERIFIED company), so 81 provinces × products with
 * nothing behind them — the doorway-page pattern `18` warns about — cannot be generated
 * from here at all. No `noindex` fallback is needed because the page simply does not
 * exist without supply.
 */
export const revalidate = 900
export function generateStaticParams(): { slug: string }[] {
  return []
}

async function loadCity(slug: string): Promise<PublicCityDetail | null> {
  try {
    const { getPublicCity } = await import('@/modules/directory/application/directory-service')
    const { anonymousActor } = await import('@/shared/context/actor')
    const result = await getPublicCity(anonymousActor(), { slug })
    return result.ok ? result.value : null
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  const detail = await loadCity(slug)
  if (detail === null) return {}
  const t = await getTranslations({ locale, namespace: 'directory' })
  return {
    title: t('cityTitle', { city: detail.city.name }),
    description: t('cityLead', { city: detail.city.name }),
    alternates: { canonical: absoluteUrl(localePath(locale, `/sehirler/${detail.city.slug}`)) },
  }
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  setRequestLocale(locale)

  const detail = await loadCity(slug)
  if (detail === null) notFound()

  const t = await getTranslations({ locale, namespace: 'directory' })

  return (
    <PublicShell>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: t('citiesTitle'),
              item: absoluteUrl(localePath(locale, '/sehirler')),
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: detail.city.name,
              item: absoluteUrl(localePath(locale, `/sehirler/${detail.city.slug}`)),
            },
          ],
        }}
      />
      <div className="flex flex-col gap-md">
        <h1 className="font-heading text-headline-lg">
          {t('cityTitle', { city: detail.city.name })}
        </h1>
        <p className="max-w-2xl text-body-lg text-muted">
          {t('cityLead', { city: detail.city.name })}
        </p>

        <ul className="grid gap-base sm:grid-cols-2">
          {detail.manufacturers.map((manufacturer) => (
            <li key={manufacturer.slug}>
              <Link href={`/ureticiler/${manufacturer.slug}`} className="block h-full">
                <Card density="dense" className="flex h-full flex-col gap-xs">
                  <div className="flex flex-wrap items-center justify-between gap-base">
                    <CardTitle>{manufacturer.displayName}</CardTitle>
                    <p className="text-body-sm text-muted">
                      {manufacturer.avgRating === null
                        ? t('newOnPlatform')
                        : `★ ${manufacturer.avgRating}`}
                    </p>
                  </div>
                  {manufacturer.about !== null ? (
                    <p className="text-body-sm text-muted">{manufacturer.about}</p>
                  ) : null}
                </Card>
              </Link>
            </li>
          ))}
        </ul>

        <div>
          <Link href="/proje/yeni" className="underline">
            {t('ctaConfigure')}
          </Link>
        </div>
      </div>
    </PublicShell>
  )
}
