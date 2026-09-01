import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { PortalShell } from '@/components/layouts/portal-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'

export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * `manufacturer_portal_dashboard_final` — task 13.8, and the **landing point of a
 * manufacturer sign-in**.
 *
 * It 404'd. `nav-items.ts` has pointed the portal's own "Panel" link at
 * `/panel/[companyId]` since Phase 3 and nobody built the page, so the first thing a
 * manufacturer saw after signing in was Next's built-in 404 — the single worst dead link in
 * the product, and one the release gate never touched because `core-flow.spec.ts` walks to
 * `/panel/{id}/talepler` directly and never presses "Panel".
 *
 * **Every number comes from `listLeadsForCompany`.** No new service method, no new table:
 * the inbox already returns the company's requests with their status and clock, and a
 * dashboard is an arrangement of facts the system holds, not a new capability. The counting
 * is `domain/dashboard-summary.ts`, pure and tested.
 *
 * What the design has and this does not — trend deltas, a report download, and a client name
 * per row — is argued in that module: the first two need a history nothing stores, and the
 * third is contact data that `ADR-006` and `19` §Disclosure release on acceptance, through a
 * disclosure record. A dashboard is not that event.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export default async function PortalDashboard({
  params,
}: {
  params: Promise<{ locale: string; companyId: string }>
}) {
  const { locale, companyId } = await params
  setRequestLocale(locale)

  const [t, status, format, { getPortalDashboard }, { resolveActor }] = await Promise.all([
    getTranslations('portal'),
    getTranslations('status'),
    getFormatter(),
    import('@/modules/offer/application/offer-request-service'),
    import('@/shared/context/actor'),
  ])

  const { headers } = await import('next/headers')
  const requestHeaders = await headers()
  const actor = await resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    { companyId },
  )

  const result = await getPortalDashboard(actor, {})
  const { counts, funnel, total } = result.ok
    ? result.value.summary
    : {
        counts: { pending: 0, accepted: 0, surveyScheduled: 0, offerSent: 0, won: 0 },
        funnel: [],
        total: 0,
      }
  const deadlines = result.ok ? result.value.deadlines : []
  const recent = result.ok ? result.value.recent : []

  const when = (at: Date) =>
    format.dateTime(at, {
      // `Europe/Istanbul` for display, UTC in the database (`CLAUDE.md` §Conventions).
      timeZone: 'Europe/Istanbul',
      dateStyle: 'medium',
      timeStyle: 'short',
    })

  const place = (lead: { cityName: string | null; districtName: string | null }) =>
    [lead.cityName, lead.districtName].filter(Boolean).join(' · ')

  /** `SURVEY_SCHEDULED` → `surveyScheduled`; the `status` catalogue is keyed that way. */
  const label = (value: string) =>
    status(value.toLowerCase().replace(/_(.)/g, (_, c: string) => c.toUpperCase()))

  return (
    <PortalShell title={t('title')} companyId={companyId}>
      <p className="pb-base text-body-md text-muted">{t('subtitle')}</p>

      {/* ── the five headline counts ─────────────────────────────────────── */}
      <ul className="grid grid-cols-2 gap-base pb-base lg:grid-cols-5">
        {(['pending', 'accepted', 'surveyScheduled', 'offerSent', 'won'] as const).map((key) => (
          <li key={key}>
            <Card density="dense">
              <CardContent>
                <p className="text-label-md uppercase text-muted">{t(`counts.${key}`)}</p>
                <p className="text-headline-lg text-on-panel">{counts[key]}</p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-base lg:flex-row lg:items-start">
        {/* ── the funnel ─────────────────────────────────────────────────── */}
        <Card className="min-w-0 flex-1">
          <CardHeader>
            <CardTitle>{t('funnel.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {total === 0 ? (
              <p className="text-body-md text-muted">{t('funnel.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-sm">
                {funnel.map((row) => (
                  <li key={row.stage} className="flex items-center gap-sm">
                    <span className="w-32 shrink-0 text-body-md text-on-panel">
                      {t(`funnel.${row.stage}`)}
                    </span>
                    {/*
                     * A proportional bar, not a chart library: four numbers do not earn a
                     * dependency, and the width is the datum.
                     */}
                    <span className="h-2 flex-1 rounded-sm bg-track" aria-hidden>
                      <span
                        className="block h-2 rounded-sm bg-action"
                        style={{ width: `${row.ofTotal}%` }}
                      />
                    </span>
                    <span className="w-20 shrink-0 text-right text-body-sm text-muted">
                      {t('funnel.value', { count: row.count, percent: row.ofTotal })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ── what the clock is running on ───────────────────────────────── */}
        <Card className="w-full shrink-0 lg:w-80">
          <CardHeader>
            <CardTitle>{t('deadlines.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {deadlines.length === 0 ? (
              <p className="text-body-md text-muted">{t('deadlines.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-sm">
                {deadlines.map((lead) => (
                  <li
                    key={lead.offerRequestId}
                    className="border-b border-divider pb-sm last:border-b-0"
                  >
                    <Link
                      href={`/panel/${companyId}/talepler/${lead.offerRequestId}`}
                      className="text-body-md font-medium text-on-panel hover:underline"
                    >
                      {place(lead) === '' ? label(lead.status) : place(lead)}
                    </Link>
                    <p className="text-body-sm text-muted">
                      {t('deadlines.due', { when: when(lead.slaExpiresAt) })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── what arrived most recently ───────────────────────────────────── */}
      <Card className="mt-base">
        <CardHeader className="flex flex-row items-center justify-between gap-sm">
          <CardTitle>{t('recent.title')}</CardTitle>
          <Link
            href={`/panel/${companyId}/talepler`}
            className="text-label-md text-action hover:underline"
          >
            {t('recent.viewAll')}
          </Link>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-body-md text-muted">{t('recent.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-sm">
              {recent.map((lead) => (
                <li
                  key={lead.offerRequestId}
                  className="flex flex-wrap items-center justify-between gap-sm border-b border-divider pb-sm last:border-b-0"
                >
                  <Link
                    href={`/panel/${companyId}/talepler/${lead.offerRequestId}`}
                    className="text-body-md text-on-panel hover:underline"
                  >
                    {place(lead) === '' ? label(lead.status) : place(lead)}
                  </Link>
                  <span className="text-body-sm text-muted">
                    {lead.areaM2 === null
                      ? t('recent.noArea')
                      : t('recent.area', { area: lead.areaM2 })}
                  </span>
                  <span className="text-body-sm text-muted">{label(lead.status)}</span>
                  <span className="text-body-sm text-muted">{when(lead.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PortalShell>
  )
}
