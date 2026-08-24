import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { LeadActions } from '@/components/manufacturer/lead-actions'
import { DashboardShell } from '@/components/layouts/dashboard-shell'
import { Card, CardTitle } from '@/components/ui/card'

/**
 * `/panel/[companyId]/talepler/[requestId]` — ONE route, TWO DTOs (task 6.5,
 * `manufacturer_request_detail_new_lead` / `manufacturer_request_detail`).
 *
 * The page renders whatever shape `getLeadForCompany` returns: a `pending` view has no
 * contact block to render — not hidden, absent — and the `accepted` view carries it with
 * the customer's note (`ADR-026`). The boundary is the service's, never this page's.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string; requestId: string }>
}) {
  const { locale, companyId, requestId } = await params
  setRequestLocale(locale)

  const [t, { getLeadForCompany }, { resolveActor }, { headers }] = await Promise.all([
    getTranslations({ locale, namespace: 'leads' }),
    import('@/modules/offer/application/offer-request-service'),
    import('@/shared/context/actor'),
    import('next/headers'),
  ])

  const requestHeaders = await headers()
  const actor = await resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    { companyId, locale },
  )

  const lead = await getLeadForCompany(actor, { offerRequestId: requestId })
  if (!lead.ok) notFound()
  const view = lead.value

  return (
    <DashboardShell title={t('listTitle')}>
      <div className="flex flex-col gap-md">
        <div className="flex flex-wrap items-center justify-between gap-base">
          <h1 className="font-heading text-headline-md">
            {view.project.cityName ?? '—'}
            {view.project.districtName === null ? '' : ` · ${view.project.districtName}`}
          </h1>
          <p className="text-body-sm text-muted">{view.status}</p>
        </div>

        <Card density="dense" className="flex flex-col gap-base">
          <CardTitle>{t('projectTitle')}</CardTitle>
          <dl className="flex flex-col gap-0.5 text-body-sm">
            <div className="flex justify-between gap-base">
              <dt>{t('area', { area: view.project.areaM2 ?? 0 })}</dt>
              <dd>
                {t('dimensions', {
                  w: view.project.widthMm ?? 0,
                  d: view.project.depthMm ?? 0,
                  h: view.project.heightMm ?? 0,
                })}
              </dd>
            </div>
          </dl>
        </Card>

        {view.kind === 'accepted' ? (
          <Card density="dense" className="flex flex-col gap-base">
            <CardTitle>{t('contactTitle')}</CardTitle>
            <dl className="flex flex-col gap-0.5 text-body-sm">
              <div className="flex justify-between gap-base">
                <dt>{view.contact.fullName ?? '—'}</dt>
                <dd>{view.contact.email}</dd>
              </div>
              {view.contact.phone === null ? null : (
                <div className="flex justify-between gap-base">
                  <dt>{t('phoneLabel')}</dt>
                  <dd>{view.contact.phone}</dd>
                </div>
              )}
            </dl>
            {view.customerNote === null ? null : (
              <div className="flex flex-col gap-xs">
                <p className="text-label-md uppercase text-muted">{t('customerNote')}</p>
                <p className="text-body-sm">{view.customerNote}</p>
              </div>
            )}
          </Card>
        ) : (
          // Absent, not masked: the pending DTO simply has no contact to render.
          <p className="text-body-sm text-muted">{t('pendingContactNote')}</p>
        )}

        <LeadActions
          offerRequestId={view.offerRequestId}
          companyId={companyId}
          status={view.status}
        />
      </div>
    </DashboardShell>
  )
}
