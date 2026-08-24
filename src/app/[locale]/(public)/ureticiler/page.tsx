import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { PublicShell } from '@/components/layouts/public-shell'
import { Card, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { absoluteUrl, localePath } from '@/shared/seo/site-url'

import type { PublicManufacturerCard } from '@/modules/directory/application/directory-service'

/**
 * `/ureticiler` — task 8.1, screen `company_comparison_architectural_systems` re-tokenised
 * as a directory. The card's rating obeys `16` §Aggregates through the DTO itself:
 * `avgRating` arrives `null` below three published reviews and the card says "new on the
 * platform" — the page cannot leak an average it was never given.
 */
export const revalidate = 900

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'directory' })
  return {
    title: t('manufacturersTitle'),
    description: t('manufacturersLead'),
    alternates: { canonical: absoluteUrl(localePath(locale, '/ureticiler')) },
  }
}

async function loadManufacturers(): Promise<PublicManufacturerCard[] | null> {
  try {
    const { listPublicManufacturers } =
      await import('@/modules/directory/application/directory-service')
    const { anonymousActor } = await import('@/shared/context/actor')
    const result = await listPublicManufacturers(anonymousActor(), {})
    return result.ok ? result.value : null
  } catch {
    return null
  }
}

export default async function ManufacturersPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations({ locale, namespace: 'directory' })
  const manufacturers = await loadManufacturers()

  return (
    <PublicShell>
      <div className="flex flex-col gap-md">
        <h1 className="font-heading text-headline-lg">{t('manufacturersTitle')}</h1>
        <p className="max-w-2xl text-body-lg text-muted">{t('manufacturersLead')}</p>

        {manufacturers === null || manufacturers.length === 0 ? (
          <p className="text-body-md text-muted">{t('manufacturersEmpty')}</p>
        ) : (
          <ul className="grid gap-base sm:grid-cols-2">
            {manufacturers.map((manufacturer) => (
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
                    <p className="mt-auto text-label-md uppercase text-muted">
                      {t('reviewCount', { count: manufacturer.reviewCount })}
                      {manufacturer.cityNames.length > 0
                        ? ` · ${manufacturer.cityNames.join(', ')}`
                        : ''}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicShell>
  )
}
