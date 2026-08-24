import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { DashboardShell } from '@/components/layouts/dashboard-shell'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'

/**
 * `/panel/[companyId]/talepler` — the manufacturer's lead inbox (task 6.5's list half;
 * screen `manufacturer_request_detail_new_lead`'s sibling). The list DTO is contact-free
 * by construction — it is built from `listLeadsForCompany`, which never selects the
 * customer at all.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function LeadsPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string }>
}) {
  const { locale, companyId } = await params
  setRequestLocale(locale)

  const [t, format, { listLeadsForCompany }, { resolveActor }, { headers }] = await Promise.all([
    getTranslations({ locale, namespace: 'leads' }),
    getFormatter({ locale }),
    import('@/modules/offer/application/offer-request-service'),
    import('@/shared/context/actor'),
    import('next/headers'),
  ])

  const requestHeaders = await headers()
  const actor = await resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    { companyId, locale },
  )

  const listed = await listLeadsForCompany(actor, {})
  const leads = listed.ok ? listed.value.leads : []

  return (
    <DashboardShell title={t('listTitle')}>
      <div className="flex flex-col gap-md">
        <h1 className="font-heading text-headline-md">{t('listTitle')}</h1>

        {leads.length === 0 ? (
          <p className="text-body-md text-muted">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col gap-base">
            {leads.map((lead) => (
              <li key={lead.offerRequestId}>
                <Card
                  density="dense"
                  className="flex flex-wrap items-center justify-between gap-base"
                >
                  <div className="flex flex-col gap-xs">
                    <CardTitle>
                      {lead.cityName ?? '—'}
                      {lead.districtName === null ? '' : ` · ${lead.districtName}`}
                    </CardTitle>
                    <p className="text-body-sm text-muted">
                      {lead.areaM2 === null ? t('newLead') : t('area', { area: lead.areaM2 })}
                      {lead.status === 'PENDING'
                        ? ` · ${t('slaDue', {
                            when: format.dateTime(lead.slaExpiresAt, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }),
                          })}`
                        : ''}
                    </p>
                  </div>
                  <Button asChild variant="outline">
                    <Link href={`/panel/${companyId}/talepler/${lead.offerRequestId}`}>
                      {t('open')}
                    </Link>
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardShell>
  )
}
