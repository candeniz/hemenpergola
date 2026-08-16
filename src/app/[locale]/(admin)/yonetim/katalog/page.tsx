import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { CatalogManager } from '@/components/admin/catalog-manager'
import { AdminShell } from '@/components/layouts/admin-shell'

import type { CategorySummary, ProductSummary } from '@/modules/catalog/application/catalog-service'

/**
 * `super_admin_product_catalog_management` — task 2.2, `CAT-03`.
 *
 * The initial lists are loaded on the server; everything after that goes through the server
 * actions the client component calls. `force-dynamic` and `await import` because this page
 * reaches a service (`CLAUDE.md` non-negotiable 9).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function CatalogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const [t, { listCategories, listProducts }, { resolveActor }] = await Promise.all([
    getTranslations('admin.catalog'),
    import('@/modules/catalog/application/catalog-service'),
    import('@/shared/context/actor'),
  ])

  const { headers } = await import('next/headers')
  const requestHeaders = await headers()
  const actor = await resolveActor({
    headers: { get: (name: string) => requestHeaders.get(name) },
  })

  const [categories, products] = await Promise.all([
    listCategories(actor, { includeInactive: true }),
    listProducts(actor, { includeInactive: true }),
  ])

  /*
   * A non-admin gets the empty lists and the screen's own forbidden path rather than a
   * crash: the service already refused, and `AdminShell` is not an authorisation boundary.
   * The real gate is that every action refuses too.
   */
  const categoryList: CategorySummary[] = categories.ok ? categories.value.categories : []
  const productList: ProductSummary[] = products.ok ? products.value.products : []

  return (
    <AdminShell title={t('title')}>
      <p className="pb-md text-body-md text-muted">{t('subtitle')}</p>
      <CatalogManager categories={categoryList} products={productList} />
    </AdminShell>
  )
}
