import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { ReviewModeration } from '@/components/admin/review-moderation'
import { DashboardShell } from '@/components/layouts/dashboard-shell'
import { Card, CardTitle } from '@/components/ui/card'

/**
 * `/yonetim/yorumlar` — the moderation queue (`16` §Moderation, screen
 * `super_admin_reviews_moderation`). Oldest first: the 2-business-day SLA is easiest to
 * hold when the queue reads in arrival order.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function ReviewModerationPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
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
    { locale },
  )

  const listed = await reviewService.listPendingReviews(actor, {})

  if (!listed.ok) {
    return (
      <DashboardShell title={t('moderationTitle')}>
        <p role="alert" className="text-body-md text-destructive">
          {t('forbidden')}
        </p>
      </DashboardShell>
    )
  }

  const reviews = listed.value

  return (
    <DashboardShell title={t('moderationTitle')}>
      <div className="flex flex-col gap-md">
        <h1 className="font-heading text-headline-md">{t('moderationTitle')}</h1>

        {reviews.length === 0 ? (
          <p className="text-body-md text-muted">{t('moderationEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-base">
            {reviews.map((review) => (
              <li key={review.id}>
                <Card density="dense" className="flex flex-col gap-base">
                  <div className="flex flex-wrap items-center justify-between gap-base">
                    <CardTitle>
                      {review.companyName} · {t('ratingOf', { value: review.ratingOverall })}
                    </CardTitle>
                    <p className="text-body-sm text-muted">
                      {format.dateTime(review.createdAt, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>
                  {review.title !== null ? (
                    <p className="font-heading text-title-md">{review.title}</p>
                  ) : null}
                  <p className="text-body-sm">{review.body}</p>
                  <div className="border-t border-control-border pt-base">
                    <ReviewModeration reviewId={review.id} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardShell>
  )
}
