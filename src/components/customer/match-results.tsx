'use client'

import { useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

import type { MatchResultView, MatchRunView } from '@/modules/matching/application/match-service'
import type { CustomerEstimate } from '@/modules/pricing/application/estimate-dto'
import { runMatchAction } from '@/app/actions/match'
import { createOfferRequestsAction } from '@/app/actions/offer'
import { ConsentCheckbox } from '@/components/legal/consent-checkbox'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { EstimateBand } from '@/components/ui/estimate-band'
import { Icon } from '@/components/ui/icon'
import { Link } from '@/i18n/navigation'
import { useRouter as useLocalisedRouter } from '@/i18n/navigation'

/**
 * The matched-manufacturers list — task 5.6, `matched_manufacturers_results` and
 * `offer_results_refined_comparison`.
 *
 * Three rules this component exists to hold:
 *
 *   **Every band is `EstimateBand`.** `26` §Phase 5 says it in its own line: the disclosure
 *   rules live in one component or in eleven screens, and the second is how line items
 *   leak. The card converts a `MatchResultView` into a `CustomerEstimate` — a type that
 *   *cannot* carry a line item — and renders the shared component; it never formats money
 *   itself. The Stitch screens show per-option prices; they predate `ADR-006` and are not
 *   copied.
 *
 *   **Comparison is capped at 3** (`CUS-06`). The cap is enforced here (a fourth checkbox
 *   is inert and says why) *and* on the compare page (extras in the URL are dropped),
 *   because a UI cap alone is a cap any edited URL ignores.
 *
 *   **`UNAVAILABLE` is a state inside the list, not a route** (5.8). A pricing failure
 *   never removed the match (`08` §Failure modes); sending the customer to an error page
 *   would re-remove it in the UI. The card stays, the band's place says "cannot be
 *   calculated right now", and nothing else changes.
 */

function toEstimate(result: MatchResultView): CustomerEstimate {
  return {
    companyId: result.companyId,
    bandLowKurus: result.bandLowKurus,
    bandHighKurus: result.bandHighKurus,
    priceOnRequest: result.priceOnRequest,
    incomplete: result.incomplete,
  }
}

const COMPARE_LIMIT = 3

export function MatchResults({ run, widened = false }: { run: MatchRunView; widened?: boolean }) {
  const t = useTranslations('results')
  const tr = useTranslations('requests')
  const locale = useLocale() === 'en' ? 'en' : 'tr'
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<string[]>([])
  const [limitNote, setLimitNote] = useState(false)
  const [consent, setConsent] = useState<{ checked: boolean; textVersion: string | null }>({
    checked: false,
    textVersion: null,
  })
  const [requestError, setRequestError] = useState<string | null>(null)
  const localisedRouter = useLocalisedRouter()

  function toggle(companyId: string) {
    setSelected((current) => {
      if (current.includes(companyId)) {
        setLimitNote(false)
        return current.filter((id) => id !== companyId)
      }
      if (current.length >= COMPARE_LIMIT) {
        setLimitNote(true)
        return current
      }
      setLimitNote(false)
      return [...current, companyId]
    })
  }

  function sendRequests() {
    startTransition(async () => {
      setRequestError(null)
      const result = (await createOfferRequestsAction({
        projectId: run.projectId,
        companyIds: selected,
        consent: { accepted: true, textVersion: consent.textVersion },
      })) as { data: unknown } | { error: { message: string } }

      if ('error' in result) {
        setRequestError(result.error.message)
        return
      }
      localisedRouter.push(`/hesap/projeler/${run.projectId}/talepler`)
    })
  }

  function recompute() {
    startTransition(async () => {
      await runMatchAction({ projectId: run.projectId })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center justify-between gap-base">
        <p className="text-body-md text-muted">{t('count', { count: run.resultCount })}</p>
        {widened ? null : (
          <Button variant="outline" onClick={recompute} disabled={pending}>
            {t('refresh')}
          </Button>
        )}
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-col gap-base">
          <div className="flex flex-wrap items-center gap-base">
            <Button asChild variant="outline">
              <Link
                href={`/hesap/projeler/${run.projectId}/karsilastir?firmalar=${selected.join(',')}`}
              >
                {t('compareCta', { count: selected.length })}
              </Link>
            </Button>
            {limitNote ? (
              <p role="status" className="text-body-sm text-muted">
                {t('compareLimit')}
              </p>
            ) : null}
          </div>

          {/* Step 5 of F1: selection → consent → send (`ADR-021`'s wall already ensured a
              session; `19` §Consent: never pre-checked, version rides with the tick). */}
          <div className="flex flex-col gap-base rounded border border-control-border bg-panel p-base">
            <p className="text-body-md">{tr('sendHint', { count: selected.length })}</p>
            <ConsentCheckbox
              checked={consent.checked}
              onChange={(checked, textVersion) => setConsent({ checked, textVersion })}
            />
            <div className="flex items-center gap-base">
              <Button onClick={sendRequests} disabled={pending || !consent.checked}>
                {tr('sendCta')}
              </Button>
              {requestError !== null ? (
                <p role="alert" className="text-body-sm text-destructive">
                  {requestError}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-body-sm text-muted">{t('compareHint')}</p>
      )}

      <ul className="flex flex-col gap-base">
        {run.results.map((result) => (
          <li key={result.companyId}>
            <Card density="dense" className="flex flex-col gap-base sm:flex-row sm:justify-between">
              <div className="flex flex-col gap-xs">
                <label className="flex items-center gap-base">
                  <input
                    type="checkbox"
                    checked={selected.includes(result.companyId)}
                    onChange={() => toggle(result.companyId)}
                    aria-label={t('compareHint')}
                  />
                  <CardTitle>{result.displayName}</CardTitle>
                </label>

                {/* The short human reason (`09` §Explainability) — a sentence, never the
                    score. The admin sees the numbers; the customer sees why it is here. */}
                <p className="flex items-center gap-xs text-body-sm text-muted">
                  <Icon name="storefront" dense />
                  {result.distanceKm === null
                    ? t('serves')
                    : t('distance', { km: Math.round(result.distanceKm) })}
                </p>
              </div>

              <div className="sm:text-right">
                {result.priceState === 'UNAVAILABLE' ? (
                  /* 5.8: a state in place of the band, not a route. Deliberately not an
                     error banner — the match itself is fine. */
                  <div className="flex flex-col gap-xs">
                    <p className="font-heading text-title-md">{t('priceUnavailable')}</p>
                    <p className="text-body-sm text-muted">{t('priceUnavailableNote')}</p>
                  </div>
                ) : (
                  <EstimateBand estimate={toEstimate(result)} locale={locale} size="compact" />
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
