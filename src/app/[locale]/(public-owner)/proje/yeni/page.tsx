import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { PublicShell } from '@/components/layouts/public-shell'
import { ProductChooser } from '@/components/project/product-chooser'

/**
 * `/proje/yeni` — the configurator's entry point (`ADR-021`, task 4.1).
 *
 * **Public.** `10` §Anonymous drafts puts the account wall between *configure* and *get
 * offers*, so this page is not auth-gated; authorisation is the project's own ownership once
 * one exists.
 *
 * `noindex` because it is a form rather than content, and `force-dynamic` because `(public)`
 * is ISR-cacheable by default and this branch of it must never be — see
 * `07-frontend-architecture.md` §Rendering strategy.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function NewProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ urun?: string }>
}) {
  const { locale } = await params
  const { urun } = await searchParams
  setRequestLocale(locale)

  const [t, { listConfigurableProducts }] = await Promise.all([
    getTranslations('wizard'),
    import('@/modules/catalog/application/catalog-service'),
  ])

  /*
   * Arriving with a product already chosen — from a product page's "configure this" — skips
   * straight to a draft. `10` §Step structure's steps 1 and 2 are a chooser, and a customer
   * who has already chosen should not be asked again.
   */
  if (urun !== undefined && urun !== '') {
    const { createProject } = await import('@/modules/project/application/project-service')
    const { resolveActor } = await import('@/shared/context/actor')
    const { headers } = await import('next/headers')

    const requestHeaders = await headers()
    const actor = await resolveActor({
      headers: { get: (name: string) => requestHeaders.get(name) },
    })

    const created = await createProject(actor, { productId: urun })
    if (created.ok) redirect(`/proje/${created.value.projectId}`)
  }

  const { anonymousActor } = await import('@/shared/context/actor')
  const listed = await listConfigurableProducts(anonymousActor(), {
    locale: locale === 'en' ? 'en' : 'tr',
  })
  const products = listed.ok ? listed.value.products : []

  return (
    <PublicShell>
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-sm px-gutter py-lg">
        <h1 className="font-heading text-display-sm">{t('startTitle')}</h1>
        <p className="text-body-md text-muted">{t('startSubtitle')}</p>
        <ProductChooser products={products} />
      </main>
    </PublicShell>
  )
}
