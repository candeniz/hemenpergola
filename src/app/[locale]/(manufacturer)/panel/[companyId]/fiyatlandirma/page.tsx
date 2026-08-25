import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { PortalShell } from '@/components/layouts/portal-shell'
import { PricingEditor } from '@/components/manufacturer/pricing-editor'

export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * `manufacturer_pricing_management` — tasks 3.3, 3.4 and 3.5.
 *
 * Loads four things because the editor needs all four to be useful rather than merely
 * correct: the products the company offers (so the draft is seeded, not empty), the version
 * history (so cloning is a button), the open draft if there is one, and the provinces for
 * regional differences.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string }>
}) {
  const { locale, companyId } = await params
  setRequestLocale(locale)

  const [t, catalog, pricing, iam, { resolveActor }, { headers }] = await Promise.all([
    getTranslations('pricing'),
    import('@/modules/catalog/application/company-product-service'),
    import('@/modules/pricing/application/price-book-service'),
    import('@/modules/iam/application/my-companies-service'),
    import('@/shared/context/actor'),
    import('next/headers'),
  ])

  const requestHeaders = await headers()
  const actor = await resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    { companyId },
  )

  const [products, books, companies] = await Promise.all([
    catalog.listCompanyProducts(actor, { companyId }),
    pricing.listPriceBooks(actor, { companyId }),
    iam.listMyCompanies(actor, {}),
  ])

  const summaries = books.ok ? books.value.books : []
  const draftSummary = summaries.find((book) => book.status === 'DRAFT') ?? null

  const draft =
    draftSummary === null
      ? null
      : await pricing.getPriceBook(actor, { companyId, priceBookId: draftSummary.priceBookId })

  // Provinces for the regional table. A raw list rather than a service call: `City` is
  // reference data seeded in Phase 0 and has no permissions of its own.
  const { listCities } = await import('@/modules/matching/application/service-area-service')
  const cities = await listCities(actor, {})

  return (
    <PortalShell
      title={t('title')}
      companyId={companyId}
      companies={companies.ok ? companies.value.companies : []}
    >
      <p className="pb-md text-body-md text-muted">{t('subtitle')}</p>
      <PricingEditor
        companyId={companyId}
        products={products.ok ? products.value.products : []}
        books={summaries}
        draft={draft !== null && draft.ok ? draft.value : null}
        cities={cities.ok ? cities.value.cities : []}
      />
    </PortalShell>
  )
}
