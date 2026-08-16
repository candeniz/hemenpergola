import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { PortalShell } from '@/components/layouts/portal-shell'

export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

import { ProductOfferForm } from '@/components/manufacturer/supply-forms'

/**
 * `manufacturer_product_management` — task 3.2.
 *
 * Driven by the whole catalogue rather than by what this company has already saved: a screen
 * that listed only its own rows would never show a manufacturer the product they are missing
 * leads on.
 */
export default async function ProductOfferPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string }>
}) {
  const { locale, companyId } = await params
  setRequestLocale(locale)

  const [t, { listCompanyProducts }, { resolveActor }] = await Promise.all([
    getTranslations('supply'),
    import('@/modules/catalog/application/company-product-service'),
    import('@/shared/context/actor'),
  ])

  const { headers } = await import('next/headers')
  const requestHeaders = await headers()
  const actor = await resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    { companyId },
  )

  const products = await listCompanyProducts(actor, { companyId })

  return (
    <PortalShell title={t('productsTitle')}>
      <p className="pb-md text-body-md text-muted">{t('productsSubtitle')}</p>
      <ProductOfferForm
        companyId={companyId}
        products={products.ok ? products.value.products : []}
      />
    </PortalShell>
  )
}
