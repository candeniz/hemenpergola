import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { RequestClose } from '@/components/admin/request-close'
import { DashboardShell } from '@/components/layouts/dashboard-shell'
import { Card, CardTitle } from '@/components/ui/card'

/**
 * `/yonetim/talepler` — the admin close queue, the last unbuilt surface of `11`'s
 * transition table. Only requests that ended WITHOUT an outcome are listed
 * (`DECLINED`/`EXPIRED`/`CANCELLED`): a won or lost engagement is finished business and
 * the machine refuses to close it, so listing it would offer a button that cannot work.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function AdminRequestsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const [t, format, service, { resolveActor }, { headers }] = await Promise.all([
    getTranslations({ locale, namespace: 'admin.requests' }),
    getFormatter({ locale }),
    import('@/modules/offer/application/offer-request-service'),
    import('@/shared/context/actor'),
    import('next/headers'),
  ])

  const requestHeaders = await headers()
  const actor = await resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    { locale },
  )

  const listed = await service.listClosableRequests(actor, {})

  if (!listed.ok) {
    return (
      <DashboardShell title={t('title')}>
        <p role="alert" className="text-body-md text-destructive">
          {t('forbidden')}
        </p>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell title={t('title')}>
      <div className="flex flex-col gap-md">
        <h1 className="font-heading text-headline-md">{t('title')}</h1>
        <p className="max-w-2xl text-body-sm text-muted">{t('lead')}</p>

        {listed.value.length === 0 ? (
          <p className="text-body-md text-muted">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col gap-base">
            {listed.value.map((request) => {
              const meta = `${request.status} · ${format.dateTime(request.updatedAt, {
                dateStyle: 'medium',
              })}`
              return (
                <li key={request.offerRequestId}>
                  <Card density="dense" className="flex flex-col gap-base">
                    <div className="flex flex-wrap items-center justify-between gap-base">
                      <CardTitle>{request.companyName}</CardTitle>
                      <p className="text-body-sm text-muted">{meta}</p>
                    </div>
                    <RequestClose offerRequestId={request.offerRequestId} />
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </DashboardShell>
  )
}
