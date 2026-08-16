import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { PortalShell } from '@/components/layouts/portal-shell'

export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

import { ServiceAreaForm } from '@/components/manufacturer/supply-forms'

/**
 * `manufacturer_service_area_management` — task 3.6.
 *
 * The city and district lists are loaded here rather than fetched by the client: 81 and 974
 * rows are small, they never change between requests, and shipping them with the page saves
 * a round trip on the one screen where a manufacturer picks from both.
 */
export default async function ServiceAreaPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string }>
}) {
  const { locale, companyId } = await params
  setRequestLocale(locale)

  const [t, { listServiceAreas, listCities, listDistricts }, { resolveActor }] = await Promise.all([
    getTranslations('supply'),
    import('@/modules/matching/application/service-area-service'),
    import('@/shared/context/actor'),
  ])

  const { headers } = await import('next/headers')
  const requestHeaders = await headers()
  const actor = await resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    { companyId },
  )

  // Q21, closed. These were `prisma.city.findMany` / `prisma.district.findMany` — a
  // non-negotiable 2 violation hidden behind a dynamic import.
  const [areas, cityResult, districtResult] = await Promise.all([
    listServiceAreas(actor, { companyId }),
    listCities(actor, { companyId }),
    listDistricts(actor, { companyId }),
  ])

  const cities = cityResult.ok
    ? cityResult.value.cities.map((city) => ({ id: city.cityId, name: city.name }))
    : []
  const districts = districtResult.ok ? districtResult.value.districts : []

  return (
    <PortalShell title={t('areasTitle')}>
      <p className="pb-md text-body-md text-muted">{t('areasSubtitle')}</p>
      <ServiceAreaForm
        companyId={companyId}
        areas={areas.ok ? areas.value.areas : []}
        cities={cities}
        districts={districts}
      />
    </PortalShell>
  )
}
