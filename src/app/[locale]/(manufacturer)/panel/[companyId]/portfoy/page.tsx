import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { PortalShell } from '@/components/layouts/portal-shell'

export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

import { PortfolioForm } from '@/components/manufacturer/supply-forms'

/** `manufacturer_portfolio_management` — task 3.7. */
export default async function PortfolioPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string }>
}) {
  const { locale, companyId } = await params
  setRequestLocale(locale)

  const [t, { listPortfolio }, { resolveActor }] = await Promise.all([
    getTranslations('supply'),
    import('@/modules/portfolio/application/portfolio-service'),
    import('@/shared/context/actor'),
  ])

  const { headers } = await import('next/headers')
  const requestHeaders = await headers()
  const actor = await resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    { companyId },
  )

  const items = await listPortfolio(actor, { companyId })

  return (
    <PortalShell title={t('portfolioTitle')}>
      <p className="pb-md text-body-md text-muted">{t('portfolioSubtitle')}</p>
      <PortfolioForm companyId={companyId} items={items.ok ? items.value.items : []} />
    </PortalShell>
  )
}
