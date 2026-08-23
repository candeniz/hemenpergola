import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { MatchResults } from '@/components/customer/match-results'
import { SupplyGapWatch } from '@/components/customer/supply-gap-watch'
import { DashboardShell } from '@/components/layouts/dashboard-shell'
import { Card, CardTitle } from '@/components/ui/card'

/**
 * `/hesap/projeler/[id]/eslesmeler` — the match results (tasks 5.6–5.8,
 * `matched_manufacturers_results`; loading: `finding_manufacturers_loading_state`).
 *
 * Behind the account wall (`ADR-021`: configuring is public, offers are not), inside the
 * `(customer)` gate (`ADR-024`). Ownership is still the service's `where` clause — the
 * layout only decides who sees a shell.
 *
 * **First visit computes, revisits read** (`09` §Pipeline): `getMatchRun` serves the stored
 * run; only when none exists does the page run the pipeline, and the loading skeleton is
 * what the customer watches while it does. "Yeniden hesapla" is the explicit re-run.
 *
 * **Zero results get the ladder, not an empty list** (task 5.7, `09` §Zero-result
 * handling): the widened search, the "may be able to help" companies, and the notify-me
 * subscription — an empty state, not an error state (`07` §System states keeps those
 * apart).
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function MatchResultsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)

  const [t, service, { resolveActor }, { headers }] = await Promise.all([
    getTranslations({ locale, namespace: 'results' }),
    import('@/modules/matching/application/match-service'),
    import('@/shared/context/actor'),
    import('next/headers'),
  ])

  const requestHeaders = await headers()
  const actor = await resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    { locale },
  )

  // The stored run, or the first computation. NOT_FOUND from getMatchRun means "no run
  // yet" only when the project itself is reachable — runMatch settles which.
  let run = await service.getMatchRun(actor, { projectId: id })
  if (!run.ok) {
    run = await service.runMatch(actor, { projectId: id })
  }
  if (!run.ok) notFound()

  const view = run.value

  if (view.resultCount > 0) {
    return (
      <DashboardShell title={t('title')}>
        <div className="flex flex-col gap-md">
          <div className="flex flex-col gap-xs">
            <h1 className="font-heading text-headline-md">{t('title')}</h1>
            <p className="text-body-md text-muted">{t('subtitle')}</p>
          </div>

          <MatchResults run={view} />
        </div>
      </DashboardShell>
    )
  }

  // ── task 5.7 · the zero-result ladder ───────────────────────────────────────
  const fallback = await service.zeroResultFallback(actor, { projectId: id })
  const widened = fallback.ok ? fallback.value.widened : []
  const nearby = fallback.ok ? fallback.value.nearby : []
  const widenedByKm = fallback.ok ? fallback.value.widenedByKm : 0

  return (
    <DashboardShell title={t('title')}>
      <div className="flex flex-col gap-md">
        <div className="flex flex-col gap-xs">
          <h1 className="font-heading text-headline-md">{t('zeroTitle')}</h1>
          <p className="text-body-md text-muted">{t('zeroBody')}</p>
        </div>

        {widened.length > 0 ? (
          <section className="flex flex-col gap-base">
            <h2 className="font-heading text-title-lg">{t('widenedTitle', { km: widenedByKm })}</h2>
            <p className="text-body-sm text-muted">{t('widenedNote', { km: widenedByKm })}</p>
            <MatchResults
              run={{
                matchRunId: view.matchRunId,
                projectId: view.projectId,
                createdAt: view.createdAt,
                resultCount: widened.length,
                results: widened,
              }}
              widened
            />
          </section>
        ) : null}

        {nearby.length > 0 ? (
          <section className="flex flex-col gap-base">
            <h2 className="font-heading text-title-lg">{t('nearbyTitle')}</h2>
            <p className="text-body-sm text-muted">{t('nearbyNote')}</p>
            <ul className="flex flex-col gap-base">
              {nearby.map((company) => (
                <li key={company.companyId}>
                  {/* Clearly separated and band-free: they do not offer this product, so
                      there is nothing honest to price (`09` §Zero-result handling). */}
                  <Card density="dense">
                    <CardTitle>{company.displayName}</CardTitle>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <SupplyGapWatch projectId={id} />
      </div>
    </DashboardShell>
  )
}
