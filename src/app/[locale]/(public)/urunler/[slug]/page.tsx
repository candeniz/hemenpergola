import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { JsonLd } from '@/components/seo/json-ld'
import { PublicShell } from '@/components/layouts/public-shell'
import { Button } from '@/components/ui/button'
import { Link, permanentRedirect } from '@/i18n/navigation'
import { absoluteUrl, localePath } from '@/shared/seo/site-url'

import type { PublicProductDetail } from '@/modules/directory/application/directory-service'

/**
 * `/urunler/[slug]` — task 8.1, screen `product_detail_bioclimatic_pergola` re-tokenised.
 * Renders whatever the catalogue holds — Q11–Q17 are still with the pilot manufacturer,
 * so the content is as real as the catalogue is, and nothing here invents copy.
 *
 * JSON-LD: `Product` only — `18` §Structured data wants `Offer.priceRange` from the band
 * aggregate, and until this page RENDERS a price, marking one up would be the
 * markup/visible mismatch `18` calls a manual-action risk. Carried to the second half.
 */
export const revalidate = 900
export function generateStaticParams(): { slug: string }[] {
  return []
}

async function loadProduct(locale: string, slug: string): Promise<PublicProductDetail | null> {
  try {
    const { getPublicProduct } = await import('@/modules/directory/application/directory-service')
    const { anonymousActor } = await import('@/shared/context/actor')
    const result = await getPublicProduct(anonymousActor(), { locale, slug })
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
  const detail = await loadProduct(locale, slug)
  if (detail === null || detail.kind === 'moved') return {}
  return {
    title: detail.product.name,
    description: detail.product.shortDescription ?? undefined,
    alternates: {
      canonical: absoluteUrl(localePath(locale, `/urunler/${detail.product.slug}`)),
    },
  }
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  setRequestLocale(locale)

  const detail = await loadProduct(locale, slug)
  if (detail === null) notFound()
  if (detail.kind !== 'found') {
    permanentRedirect({ href: `/urunler/${detail.slug}`, locale })
    return null
  }

  const t = await getTranslations({ locale, namespace: 'directory' })
  const { product } = detail

  return (
    <PublicShell>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.name,
          ...(product.shortDescription === null ? {} : { description: product.shortDescription }),
          url: absoluteUrl(localePath(locale, `/urunler/${product.slug}`)),
        }}
      />
      <div className="flex flex-col gap-md">
        {product.category !== null ? (
          <p className="text-label-md uppercase text-muted">
            {t('categoryLabel')}:{' '}
            <Link href={`/kategoriler/${product.category.slug}`} className="underline">
              {product.category.name}
            </Link>
          </p>
        ) : null}

        <h1 className="font-heading text-headline-lg">{product.name}</h1>
        {product.shortDescription !== null ? (
          <p className="max-w-2xl text-body-lg text-muted">{product.shortDescription}</p>
        ) : null}
        {product.description !== null ? (
          <p className="max-w-2xl whitespace-pre-wrap text-body-md">{product.description}</p>
        ) : null}

        {product.attributes.length > 0 ? (
          <section className="flex flex-col gap-base">
            <h2 className="font-heading text-headline-md">{t('attributesTitle')}</h2>
            <dl className="flex flex-col gap-xs">
              {product.attributes.map((attribute) => (
                <div key={attribute.name} className="flex flex-wrap gap-base text-body-sm">
                  <dt className="font-heading">{attribute.name}</dt>
                  {attribute.options.length > 0 ? (
                    <dd className="text-muted">{attribute.options.join(' · ')}</dd>
                  ) : null}
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <div>
          <Button asChild variant="confirm" size="touch">
            <Link href="/proje/yeni">{t('ctaConfigure')}</Link>
          </Button>
        </div>
      </div>
    </PublicShell>
  )
}
