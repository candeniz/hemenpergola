import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { RequestDecision } from '@/components/customer/request-decision'
import { ReviewForm } from '@/components/customer/review-form'
import { MessageThread } from '@/components/messaging/message-thread'
import { DashboardShell } from '@/components/layouts/dashboard-shell'
import { Card, CardTitle } from '@/components/ui/card'
import { EstimateBand } from '@/components/ui/estimate-band'
import { formatKurus } from '@/shared/money'

/**
 * `/hesap/projeler/[id]/talepler` — the customer's request tracker (tasks 6.5, 6.9;
 * screens `request_success_confirmation` → offer views).
 *
 * Two `11` rules render here:
 *
 *   **The countdown is visible to the customer too** (`11` §SLA — "a one-sided countdown is
 *   a trust problem").
 *
 *   **The offer stands beside the original estimate, labelled net-of-KDV** (`ADR-007`,
 *   task 6.9): the customer saw a band, now sees a gross figure, and the gap between them is
 *   explained where it appears rather than in support.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function CustomerRequestsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)

  const [t, format, requestsService, offersService, { resolveActor }, { headers }] =
    await Promise.all([
      getTranslations({ locale, namespace: 'requests' }),
      getFormatter({ locale }),
      import('@/modules/offer/application/offer-request-service'),
      import('@/modules/offer/application/offer-service'),
      import('@/shared/context/actor'),
      import('next/headers'),
    ])

  const requestHeaders = await headers()
  const actor = await resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    { locale },
  )

  const reviewService = await import('@/modules/review/application/review-service')

  const listed = await requestsService.listRequestsForProject(actor, { projectId: id })
  const requests = listed.ok ? listed.value.requests : []

  const MESSAGING_STATES = [
    'ACCEPTED',
    'SURVEY_SCHEDULED',
    'SURVEY_COMPLETED',
    'OFFER_SENT',
    'OFFER_ACCEPTED',
    'OFFER_REJECTED',
    'WON',
    'LOST',
    // A cancel after acceptance leaves a transcript that stays readable (15 §Rules);
    // a cancel from PENDING just renders the empty state.
    'CANCELLED',
  ]

  const withOffers = await Promise.all(
    requests.map(async (request) => {
      const [offers, eligibility] = await Promise.all([
        offersService.getOffersForRequest(actor, { offerRequestId: request.offerRequestId }),
        reviewService.getReviewEligibility(actor, { offerRequestId: request.offerRequestId }),
      ])
      return {
        request,
        view: offers.ok ? offers.value : null,
        review: eligibility.ok ? eligibility.value : null,
      }
    }),
  )

  const bandLocale = locale === 'en' ? 'en' : 'tr'

  return (
    <DashboardShell title={t('listTitle')}>
      <div className="flex flex-col gap-md">
        <h1 className="font-heading text-headline-md">{t('listTitle')}</h1>

        {withOffers.length === 0 ? (
          <p className="text-body-md text-muted">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col gap-base">
            {withOffers.map(({ request, view, review }) => (
              <li key={request.offerRequestId}>
                <Card density="dense" className="flex flex-col gap-base">
                  <div className="flex flex-wrap items-center justify-between gap-base">
                    <CardTitle>{request.companyName}</CardTitle>
                    <p className="text-body-sm text-muted">{t(`status.${request.status}`)}</p>
                  </div>

                  {request.status === 'PENDING' ? (
                    // The customer sees the same clock the manufacturer races (`11` §SLA).
                    <p className="text-body-sm text-muted">
                      {t('countdown', {
                        when: format.dateTime(request.slaExpiresAt, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }),
                      })}
                    </p>
                  ) : null}

                  {view !== null && view.offers.length > 0 ? (
                    <div className="flex flex-col gap-base border-t border-control-border pt-base">
                      {/* 6.9: the original band first, then the gross figure, with the
                          net-of-KDV note bridging them (`ADR-007`). */}
                      {view.originalEstimate !== null ? (
                        <div className="flex flex-col gap-xs">
                          <p className="text-label-md uppercase text-muted">
                            {t('originalEstimate')}
                          </p>
                          <EstimateBand
                            estimate={{
                              companyId: request.companyId,
                              bandLowKurus: view.originalEstimate.bandLowKurus,
                              bandHighKurus: view.originalEstimate.bandHighKurus,
                              priceOnRequest: false,
                              incomplete: false,
                            }}
                            locale={bandLocale}
                            size="compact"
                          />
                          <p className="text-body-sm text-muted">{t('estimateNetNote')}</p>
                        </div>
                      ) : null}

                      {view.offers.map((offer) => (
                        <div key={offer.offerId} className="flex flex-col gap-xs">
                          <div className="flex flex-wrap items-center justify-between gap-base">
                            <p className="font-heading text-title-md">
                              {t('offerFrom', { company: view.companyName })} · {offer.number}
                            </p>
                            {offer.status === 'SUPERSEDED' ? (
                              <p className="text-body-sm text-muted">{t('superseded')}</p>
                            ) : null}
                          </div>
                          <dl className="flex flex-col gap-0.5 text-body-sm">
                            <div className="flex justify-between gap-base">
                              <dt>{t('net')}</dt>
                              <dd>{formatKurus(offer.netKurus, bandLocale)}</dd>
                            </div>
                            <div className="flex justify-between gap-base">
                              <dt>{t('tax', { rate: offer.taxRate })}</dt>
                              <dd>{formatKurus(offer.taxKurus, bandLocale)}</dd>
                            </div>
                            <div className="flex justify-between gap-base font-heading">
                              <dt>{t('gross')}</dt>
                              <dd>{formatKurus(offer.grossKurus, bandLocale)}</dd>
                            </div>
                          </dl>
                          <p className="text-body-sm text-muted">
                            {t('validUntil', {
                              when: format.dateTime(offer.validUntil, { dateStyle: 'medium' }),
                            })}
                          </p>
                        </div>
                      ))}

                      {request.status === 'OFFER_SENT' ? (
                        <RequestDecision offerRequestId={request.offerRequestId} />
                      ) : null}
                    </div>
                  ) : null}

                  {/* Messaging opens with acceptance and never before (ADR-028). */}
                  {MESSAGING_STATES.includes(request.status) ? (
                    <div className="border-t border-control-border pt-base">
                      <MessageThread offerRequestId={request.offerRequestId} side="customer" />
                    </div>
                  ) : null}

                  {/* Reviews open at SURVEY_COMPLETED (16 §Eligibility). */}
                  {review !== null ? (
                    review.eligible ? (
                      <div className="border-t border-control-border pt-base">
                        <ReviewForm offerRequestId={request.offerRequestId} />
                      </div>
                    ) : review.review !== null ? (
                      <div className="flex flex-col gap-xs border-t border-control-border pt-base">
                        <p className="text-body-sm text-muted">
                          {t(`reviewStatus.${review.review.status}`)}
                        </p>
                        {review.review.status === 'REJECTED' &&
                        review.review.rejectionReason !== null ? (
                          <p className="text-body-sm text-muted">{review.review.rejectionReason}</p>
                        ) : null}
                        {review.review.response !== null ? (
                          <p className="text-body-sm">
                            {t('companyResponded')}: {review.review.response.body}
                          </p>
                        ) : null}
                      </div>
                    ) : null
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardShell>
  )
}
