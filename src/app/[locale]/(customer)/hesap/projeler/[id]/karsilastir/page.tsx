import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { DashboardShell } from '@/components/layouts/dashboard-shell'
import { EstimateBand } from '@/components/ui/estimate-band'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

/**
 * `/hesap/projeler/[id]/karsilastir?firmalar=a,b,c` — side-by-side comparison
 * (`compare_manufacturers_refined_style`, task 5.6).
 *
 * **The cap is 3 and it is enforced here, not only in the checkbox UI** (`CUS-06`): the
 * selection travels in the URL, and a URL is editable, so extras are dropped server-side
 * with a line saying so. Every band is `EstimateBand` — the comparison shows exactly what
 * the results page shows, side by side; a comparison that showed more would be the leak
 * `ADR-006` exists to prevent.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const COMPARE_LIMIT = 3

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>
  searchParams: Promise<{ firmalar?: string }>
}) {
  const [{ locale, id }, { firmalar }] = await Promise.all([params, searchParams])
  setRequestLocale(locale)

  const [t, service, { resolveActor }, { headers }] = await Promise.all([
    getTranslations({ locale, namespace: 'compare' }),
    import('@/modules/matching/application/match-service'),
    import('@/shared/context/actor'),
    import('next/headers'),
  ])

  const requestHeaders = await headers()
  const actor = await resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    { locale },
  )

  const run = await service.getMatchRun(actor, { projectId: id })
  if (!run.ok) notFound()

  const requested = (firmalar ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '')
  const overLimit = requested.length > COMPARE_LIMIT
  const chosen = new Set(requested.slice(0, COMPARE_LIMIT))

  const columns = run.value.results.filter((result) => chosen.has(result.companyId))
  const bandLocale = locale === 'en' ? 'en' : 'tr'

  return (
    <DashboardShell title={t('title')}>
      <div className="flex flex-col gap-md">
        <div className="flex flex-wrap items-center justify-between gap-base">
          <h1 className="font-heading text-headline-md">{t('title')}</h1>
          <Button asChild variant="outline">
            <Link href={`/hesap/projeler/${id}/eslesmeler`}>{t('backToResults')}</Link>
          </Button>
        </div>

        {overLimit ? (
          <p role="status" className="text-body-sm text-muted">
            {t('maxNote')}
          </p>
        ) : null}

        {columns.length === 0 ? (
          <p className="text-body-md text-muted">{t('empty')}</p>
        ) : (
          <div className="grid gap-base sm:grid-cols-2 lg:grid-cols-3">
            {columns.map((result) => (
              <div
                key={result.companyId}
                className="flex flex-col gap-base rounded border border-control-border bg-panel p-base"
              >
                <p className="font-heading text-title-md">{result.displayName}</p>

                <dl className="flex flex-col gap-base text-body-sm">
                  <div className="flex flex-col gap-xs">
                    <dt className="text-label-md uppercase text-muted">{t('estimate')}</dt>
                    <dd>
                      <EstimateBand
                        estimate={{
                          companyId: result.companyId,
                          bandLowKurus: result.bandLowKurus,
                          bandHighKurus: result.bandHighKurus,
                          priceOnRequest: result.priceOnRequest,
                          incomplete: result.incomplete,
                        }}
                        locale={bandLocale}
                        size="compact"
                      />
                    </dd>
                  </div>

                  <div className="flex flex-col gap-xs">
                    <dt className="text-label-md uppercase text-muted">{t('distance')}</dt>
                    <dd>
                      {result.distanceKm === null
                        ? t('distanceUnknown')
                        : t('distanceValue', { km: Math.round(result.distanceKm) })}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
