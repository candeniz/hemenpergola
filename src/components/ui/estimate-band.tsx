import { useTranslations } from 'next-intl'

import type { CustomerEstimate } from '@/modules/pricing/application/estimate-dto'
import { cn } from '@/lib/utils'
import { formatKurus } from '@/shared/money'

import { Icon } from './icon'

/**
 * `EstimateBand` — `22-design-system.md` §Patterns calls this *"the one to get right first"*.
 *
 * *"Every price a customer sees goes through it, so the disclosure rules live in one
 * component instead of eleven screens."* That is the entire argument for building it now,
 * three phases before a customer surface exists: the rules are decided here, once, while
 * there is nothing to retrofit.
 *
 * Four rules, and each is a line of `ADR-006` / `PRC-03` / `PRC-04` / `PRC-05`:
 *
 *   1. The **band**, never a point estimate and never a line item. The prop type is
 *      `CustomerEstimate`, which makes carrying one a compile error rather than a review
 *      note (`estimate-dto.ts`).
 *   2. **"Estimated · excl. KDV"**, always. `ADR-007`: the brief mentions KDV only on the
 *      final offer, and silence at the estimate is a complaint generator.
 *   3. **`PRC-04`'s caveat** — the price may change after the technical inspection. Not a
 *      tooltip: a customer who has to hover has not read it.
 *   4. The **`priceOnRequest` variant**, which is a company that is matchable and has chosen
 *      not to display a number (`ADR-006` item 4, `PRC-06`). It is deliberately not styled as
 *      an error; nothing has gone wrong.
 */

export type EstimateBandProps = {
  estimate: CustomerEstimate
  locale?: 'tr' | 'en'
  /** `compact` for a results card, `full` for a detail page. */
  size?: 'compact' | 'full'
  className?: string
}

export function EstimateBand({
  estimate,
  locale = 'tr',
  size = 'full',
  className,
}: EstimateBandProps) {
  const t = useTranslations('estimate')

  const priceOnRequest =
    estimate.priceOnRequest || estimate.bandLowKurus === null || estimate.bandHighKurus === null

  return (
    <div
      className={cn('flex flex-col gap-xs', className)}
      // The band is one figure, not two numbers with a dash between them; a screen reader
      // that announces "95 000 dash 105 000" has not conveyed a range.
      role="group"
      aria-label={t('ariaLabel')}
    >
      {priceOnRequest ? (
        <p
          className={cn('font-heading', size === 'compact' ? 'text-title-md' : 'text-headline-md')}
        >
          {t('onRequest')}
        </p>
      ) : (
        <p
          className={cn('font-heading', size === 'compact' ? 'text-title-md' : 'text-headline-md')}
        >
          {t('range', {
            low: formatKurus(estimate.bandLowKurus ?? 0, locale),
            high: formatKurus(estimate.bandHighKurus ?? 0, locale),
          })}
        </p>
      )}

      <p className="text-label-md uppercase text-muted">{t('label')}</p>

      {estimate.incomplete ? (
        // `08` §Failure modes: an option with no price contributed zero. Saying so is the
        // difference between a band that is low and a band that is wrong.
        <p className="flex items-center gap-xs text-body-sm text-muted">
          <Icon name="info" dense />
          {t('incomplete')}
        </p>
      ) : null}

      {priceOnRequest ? (
        <p className="text-body-sm text-muted">{t('onRequestNote')}</p>
      ) : (
        <p className="text-body-sm text-muted">{t('inspectionNote')}</p>
      )}
    </div>
  )
}
