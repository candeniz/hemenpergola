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

  const [t, { listServiceAreas }, { resolveActor }, { prisma }] = await Promise.all([
    getTranslations('supply'),
    import('@/modules/matching/application/service-area-service'),
    import('@/shared/context/actor'),
    import('@/shared/db'),
  ])

  const { headers } = await import('next/headers')
  const requestHeaders = await headers()
  const actor = await resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    { companyId },
  )

  const [areas, cities, districts] = await Promise.all([
    listServiceAreas(actor, { companyId }),
    prisma.city.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.district.findMany({
      select: { id: true, cityId: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

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
