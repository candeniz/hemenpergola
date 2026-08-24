import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { JsonLd } from '@/components/seo/json-ld'
import { PublicShell } from '@/components/layouts/public-shell'
import { Card, CardTitle } from '@/components/ui/card'
import { absoluteUrl, localePath } from '@/shared/seo/site-url'

import type { PublicManufacturerProfile } from '@/modules/directory/application/directory-service'

/**
 * `/ureticiler/[slug]` — task 8.1, screen `manufacturer_profile_architectural_systems`
 * re-tokenised. Two Phase 7 hand-offs land here:
 *
 *   - the average renders ONLY from three published reviews (`16` §Aggregates) — the DTO
 *     ships `avgRating: null` below that, so the page shows "new on the platform";
 *   - `AggregateRating` JSON-LD exists under exactly the same condition, because markup
 *     that disagrees with the visible page is a manual-action risk (`18`).
 */
export const revalidate = 900
export function generateStaticParams(): { slug: string }[] {
  return []
}

async function loadProfile(slug: string): Promise<PublicManufacturerProfile | null> {
  try {
    const { getPublicManufacturer } =
      await import('@/modules/directory/application/directory-service')
    const { anonymousActor } = await import('@/shared/context/actor')
    const result = await getPublicManufacturer(anonymousActor(), { slug })
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
  const profile = await loadProfile(slug)
  if (profile === null) return {}
  return {
    title: profile.card.displayName,
    description: profile.card.about ?? undefined,
    alternates: {
      canonical: absoluteUrl(localePath(locale, `/ureticiler/${profile.card.slug}`)),
    },
  }
}

export default async function ManufacturerProfilePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  setRequestLocale(locale)

  const profile = await loadProfile(slug)
  if (profile === null) notFound()

  const [t, format] = await Promise.all([
    getTranslations({ locale, namespace: 'directory' }),
    getFormatter({ locale }),
  ])
  const { card } = profile
  const ratingLabel = card.avgRating === null ? t('newOnPlatform') : `★ ${card.avgRating}`
  const reviewCountLabel = ` · ${t('reviewCount', { count: card.reviewCount })}`

  return (
    <PublicShell>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'LocalBusiness',
          name: card.displayName,
          url: absoluteUrl(localePath(locale, `/ureticiler/${card.slug}`)),
          ...(card.about === null ? {} : { description: card.about }),
          ...(card.avgRating === null
            ? {}
            : {
                aggregateRating: {
                  '@type': 'AggregateRating',
                  ratingValue: card.avgRating,
                  reviewCount: card.reviewCount,
                  bestRating: 5,
                  worstRating: 1,
                },
                review: profile.reviews.slice(0, 5).map((review) => ({
                  '@type': 'Review',
                  reviewRating: {
                    '@type': 'Rating',
                    ratingValue: review.ratingOverall,
                    bestRating: 5,
                    worstRating: 1,
                  },
                  ...(review.title === null ? {} : { name: review.title }),
                  reviewBody: review.body,
                })),
              }),
        }}
      />
      <div className="flex flex-col gap-md">
        <div className="flex flex-wrap items-center justify-between gap-base">
          <h1 className="font-heading text-headline-lg">{card.displayName}</h1>
          <p className="text-body-md text-muted">
            {ratingLabel}
            {reviewCountLabel}
          </p>
        </div>

        {card.about !== null ? (
          <p className="max-w-2xl text-body-lg text-muted">{card.about}</p>
        ) : null}

        <p className="text-body-sm text-muted">
          {profile.foundedYear !== null ? t('foundedYear', { year: profile.foundedYear }) : null}
          {profile.foundedYear !== null && profile.employeeRange !== null ? ' · ' : null}
          {profile.employeeRange !== null
            ? t('employeeRange', { range: profile.employeeRange })
            : null}
        </p>

        {card.cityNames.length > 0 ? (
          <p className="text-body-sm text-muted">
            {t('serves')}: {card.cityNames.join(', ')}
          </p>
        ) : null}

        <section className="flex flex-col gap-base">
          <h2 className="font-heading text-headline-md">{t('portfolioTitle')}</h2>
          {profile.portfolio.length === 0 ? (
            <p className="text-body-sm text-muted">{t('portfolioEmpty')}</p>
          ) : (
            <ul className="grid gap-base sm:grid-cols-2">
              {profile.portfolio.map((item, index) => (
                <li key={`${item.title}-${index}`}>
                  <Card density="dense" className="flex flex-col gap-xs">
                    <CardTitle>{item.title}</CardTitle>
                    {item.description !== null ? (
                      <p className="text-body-sm text-muted">{item.description}</p>
                    ) : null}
                    {item.completedAt !== null ? (
                      <p className="text-label-md uppercase text-muted">
                        {format.dateTime(item.completedAt, { year: 'numeric', month: 'long' })}
                      </p>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-base">
          <h2 className="font-heading text-headline-md">{t('reviewsTitle')}</h2>
          {profile.reviews.length === 0 ? (
            <p className="text-body-sm text-muted">{t('reviewsEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-base">
              {profile.reviews.map((review, index) => {
                const reviewRatingLabel = `★ ${review.ratingOverall}`
                return (
                  <li key={`${review.publishedAt?.toISOString() ?? ''}-${index}`}>
                    <Card density="dense" className="flex flex-col gap-xs">
                      <div className="flex flex-wrap items-center justify-between gap-base">
                        <CardTitle>{review.title ?? reviewRatingLabel}</CardTitle>
                        <p className="text-body-sm text-muted">
                          {reviewRatingLabel}
                          {review.publishedAt !== null
                            ? ` · ${format.dateTime(review.publishedAt, { dateStyle: 'medium' })}`
                            : ''}
                        </p>
                      </div>
                      <p className="text-body-sm">{review.body}</p>
                      {review.response !== null ? (
                        <div className="flex flex-col gap-xs border-t border-control-border pt-xs">
                          <p className="text-label-md uppercase text-muted">
                            {t('companyResponse')}
                          </p>
                          <p className="text-body-sm">{review.response.body}</p>
                        </div>
                      ) : null}
                    </Card>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </PublicShell>
  )
}
