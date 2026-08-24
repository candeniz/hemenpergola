import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { PublicShell } from '@/components/layouts/public-shell'
import { Card, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { absoluteUrl, localePath } from '@/shared/seo/site-url'

import type { PublicCategory } from '@/modules/directory/application/directory-service'

/**
 * `/kategoriler` — task 8.1, screen `marketplace_home_refined_style` (category grid),
 * re-tokenised per `ADR-012`.
 *
 * ISR (`revalidate` below), and the catch is not decoration: this page prerenders at
 * BUILD time, where `23` §Configuration guarantees no environment exists — the CI build
 * job has no `.env` precisely to enforce that. The build therefore renders the empty
 * state; the first revalidation on a running server (which has a database) fills it.
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
    title: t('categoriesTitle'),
    description: t('categoriesLead'),
    alternates: { canonical: absoluteUrl(localePath(locale, '/kategoriler')) },
  }
}

async function loadCategories(locale: string): Promise<PublicCategory[] | null> {
  try {
    const { listPublicCategories } =
      await import('@/modules/directory/application/directory-service')
    const { anonymousActor } = await import('@/shared/context/actor')
    const result = await listPublicCategories(anonymousActor({}), { locale })
    return result.ok ? result.value : null
  } catch {
    // Build-time prerender without an environment, or a database outage at revalidation:
    // either way the page renders its empty state rather than failing the build/request.
    return null
  }
}

export default async function CategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations({ locale, namespace: 'directory' })
  const categories = await loadCategories(locale)

  return (
    <PublicShell>
      <div className="flex flex-col gap-md">
        <h1 className="font-heading text-headline-lg">{t('categoriesTitle')}</h1>
        <p className="max-w-2xl text-body-lg text-muted">{t('categoriesLead')}</p>

        {categories === null || categories.length === 0 ? (
          <p className="text-body-md text-muted">{t('categoriesEmpty')}</p>
        ) : (
          <ul className="grid gap-base sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <li key={category.slug}>
                <Link href={`/kategoriler/${category.slug}`} className="block h-full">
                  <Card density="dense" className="flex h-full flex-col gap-xs">
                    <CardTitle>{category.name}</CardTitle>
                    {category.description !== null ? (
                      <p className="text-body-sm text-muted">{category.description}</p>
                    ) : null}
                    <p className="mt-auto text-label-md uppercase text-muted">
                      {t('productCount', { count: category.productCount })}
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
