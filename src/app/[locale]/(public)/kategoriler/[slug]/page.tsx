import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { JsonLd } from '@/components/seo/json-ld'
import { PublicShell } from '@/components/layouts/public-shell'
import { Card, CardTitle } from '@/components/ui/card'
import { Link, permanentRedirect } from '@/i18n/navigation'
import { absoluteUrl, localePath } from '@/shared/seo/site-url'

import type { PublicCategoryDetail } from '@/modules/directory/application/directory-service'

/**
 * `/kategoriler/[slug]` — task 8.1. ISR with no build-time prerender: `generateStaticParams`
 * returns `[]` on purpose (enumerating slugs would query the database at build, which `23`
 * §Configuration forbids), so every slug renders on first request and caches.
 *
 * A slug that moved answers with a PERMANENT redirect to the current one (task 8.5,
 * `18` §URLs) — the indexed URL keeps working across renames, forever.
 */
export const revalidate = 900
export function generateStaticParams(): { slug: string }[] {
  return []
}

async function loadCategory(locale: string, slug: string): Promise<PublicCategoryDetail | null> {
  try {
    const { getPublicCategory } = await import('@/modules/directory/application/directory-service')
    const { anonymousActor } = await import('@/shared/context/actor')
    const result = await getPublicCategory(anonymousActor(), { locale, slug })
    return result.ok ? result.value : null
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  const detail = await loadCategory(locale, slug)
  if (detail === null || detail.kind === 'moved') return {}
  return {
    title: detail.category.name,
    description: detail.category.description ?? undefined,
    alternates: {
      canonical: absoluteUrl(localePath(locale, `/kategoriler/${detail.category.slug}`)),
    },
  }
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  setRequestLocale(locale)

  const detail = await loadCategory(locale, slug)
  if (detail === null) notFound()
  if (detail.kind !== 'found') {
    permanentRedirect({ href: `/kategoriler/${detail.slug}`, locale })
    return null
  }

  const t = await getTranslations({ locale, namespace: 'directory' })

  return (
    <PublicShell>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: t('categoriesTitle'),
              item: absoluteUrl(localePath(locale, '/kategoriler')),
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: detail.category.name,
              item: absoluteUrl(localePath(locale, `/kategoriler/${detail.category.slug}`)),
            },
          ],
        }}
      />
      <div className="flex flex-col gap-md">
        <h1 className="font-heading text-headline-lg">{detail.category.name}</h1>
        {detail.category.description !== null ? (
          <p className="max-w-2xl text-body-lg text-muted">{detail.category.description}</p>
        ) : null}

        {detail.products.length === 0 ? (
          <p className="text-body-md text-muted">{t('productsEmpty')}</p>
        ) : (
          <ul className="grid gap-base sm:grid-cols-2 lg:grid-cols-3">
            {detail.products.map((product) => (
              <li key={product.slug}>
                <Link href={`/urunler/${product.slug}`} className="block h-full">
                  <Card density="dense" className="flex h-full flex-col gap-xs">
                    <CardTitle>{product.name}</CardTitle>
                    {product.shortDescription !== null ? (
                      <p className="text-body-sm text-muted">{product.shortDescription}</p>
                    ) : null}
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
