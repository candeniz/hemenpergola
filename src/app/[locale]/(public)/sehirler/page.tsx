import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { PublicShell } from '@/components/layouts/public-shell'
import { Card, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { absoluteUrl, localePath } from '@/shared/seo/site-url'

import type { PublicCity } from '@/modules/directory/application/directory-service'

/**
 * `/sehirler` — task 8.2's index. Lists ONLY supplied cities: the list is read from
 * supply (active service areas of VERIFIED companies), never from a launch list that
 * goes stale (Q5). With three seeded manufacturers this is a short list — that is the
 * correct result, not a problem to pad away.
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
    title: t('citiesTitle'),
    description: t('citiesLead'),
    alternates: { canonical: absoluteUrl(localePath(locale, '/sehirler')) },
  }
}

async function loadCities(): Promise<PublicCity[] | null> {
  try {
    const { listPublicCities } = await import('@/modules/directory/application/directory-service')
    const { anonymousActor } = await import('@/shared/context/actor')
    const result = await listPublicCities(anonymousActor(), {})
    return result.ok ? result.value : null
  } catch {
    return null
  }
}

export default async function CitiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations({ locale, namespace: 'directory' })
  const cities = await loadCities()

  return (
    <PublicShell>
      <div className="flex flex-col gap-md">
        <h1 className="font-heading text-headline-lg">{t('citiesTitle')}</h1>
        <p className="max-w-2xl text-body-lg text-muted">{t('citiesLead')}</p>

        {cities === null || cities.length === 0 ? (
          <p className="text-body-md text-muted">{t('citiesEmpty')}</p>
        ) : (
          <ul className="grid gap-base sm:grid-cols-2 lg:grid-cols-3">
            {cities.map((city) => (
              <li key={city.slug}>
                <Link href={`/sehirler/${city.slug}`} className="block h-full">
                  <Card density="dense" className="flex h-full flex-col gap-xs">
                    <CardTitle>{city.name}</CardTitle>
                    <p className="text-label-md uppercase text-muted">
                      {t('cityManufacturerCount', { count: city.manufacturerCount })}
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
