import { useTranslations } from 'next-intl'

import { DashboardShell } from '@/components/layouts/dashboard-shell'
import { Card } from '@/components/ui/card'

/**
 * `finding_manufacturers_loading_state` / `offer_results_loading_state` — the skeleton the
 * customer watches while the first run computes. Three placeholder cards, because the
 * loading state should be shaped like the answer (`07` §System states), and an answer here
 * is a short list of companies with a band on the right.
 */
export default function MatchResultsLoading() {
  const t = useTranslations('results')

  return (
    <DashboardShell title={t('title')}>
      <div className="flex flex-col gap-md" aria-busy="true">
        <div className="flex flex-col gap-xs">
          <h1 className="font-heading text-headline-md">{t('loadingTitle')}</h1>
          <p className="text-body-md text-muted">{t('loadingBody')}</p>
        </div>

        <ul className="flex flex-col gap-base">
          {[0, 1, 2].map((index) => (
            <li key={index}>
              <Card density="dense" className="flex items-center justify-between gap-base">
                <div className="flex flex-col gap-xs">
                  <div className="h-5 w-48 animate-pulse rounded bg-control-border" />
                  <div className="h-4 w-32 animate-pulse rounded bg-control-border" />
                </div>
                <div className="h-8 w-40 animate-pulse rounded bg-control-border" />
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </DashboardShell>
  )
}
