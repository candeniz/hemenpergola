import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { ReviewResponseForm } from '@/components/manufacturer/review-response-form'
import { DashboardShell } from '@/components/layouts/dashboard-shell'
import { Card, CardTitle } from '@/components/ui/card'

/**
 * `/panel/[companyId]/yorumlar` — task 7.2. PUBLISHED reviews only, by design: a
 * manufacturer cannot see who is about to review them (`16` §Anti-gaming), so PENDING
 * rows are invisible here — the list IS the public record plus the response box.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function CompanyReviewsPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string }>
}) {
  const { locale, companyId } = await params
  setRequestLocale(locale)

  const [t, format, reviewService, { resolveActor }, { headers }] = await Promise.all([
    getTranslations({ locale, namespace: 'reviews' }),
    getFormatter({ locale }),
    import('@/modules/review/application/review-service'),
    import('@/shared/context/actor'),
    import('next/headers'),
  ])

  const requestHeaders = await headers()
  const actor = await resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    { companyId, locale },
  )

  const listed = await reviewService.listPublishedReviewsAsCompany(actor, {})

  if (!listed.ok) {
    return (
      <DashboardShell title={t('companyTitle')}>
        <p role="alert" className="text-body-md text-destructive">
          {t('forbidden')}
        </p>
      </DashboardShell>
    )
  }

  const reviews = listed.value

  return (
    <DashboardShell title={t('companyTitle')}>
      <div className="flex flex-col gap-md">
        <h1 className="font-heading text-headline-md">{t('companyTitle')}</h1>

        {reviews.length === 0 ? (
          <p className="text-body-md text-muted">{t('companyEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-base">
            {reviews.map((review) => (
              <li key={review.id}>
                <Card density="dense" className="flex flex-col gap-base">
                  <div className="flex flex-wrap items-center justify-between gap-base">
                    <CardTitle>
                      {review.title ?? t('untitled')} ·{' '}
                      {t('ratingOf', { value: review.ratingOverall })}
                    </CardTitle>
                    {review.publishedAt !== null ? (
                      <p className="text-body-sm text-muted">
                        {format.dateTime(review.publishedAt, { dateStyle: 'medium' })}
                      </p>
                    ) : null}
                  </div>

                  <dl className="flex flex-wrap gap-base text-body-sm text-muted">
                    <div>
                      {t('dimension.ratingQuality')}:{' '}
                      {t('ratingOf', { value: review.ratingQuality })}
                    </div>
                    <div>
                      {t('dimension.ratingCommunication')}:{' '}
                      {t('ratingOf', { value: review.ratingCommunication })}
                    </div>
                    <div>
                      {t('dimension.ratingTimeliness')}:{' '}
                      {t('ratingOf', { value: review.ratingTimeliness })}
                    </div>
                  </dl>

                  <p className="text-body-sm">{review.body}</p>

                  {review.response !== null ? (
                    <div className="flex flex-col gap-xs border-t border-control-border pt-base">
                      <p className="text-label-md uppercase text-muted">{t('yourResponse')}</p>
                      <p className="text-body-sm">{review.response.body}</p>
                    </div>
                  ) : (
                    <div className="border-t border-control-border pt-base">
                      <ReviewResponseForm reviewId={review.id} companyId={companyId} />
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardShell>
  )
}
