'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

import { watchSupplyGapAction } from '@/app/actions/match'
import { Button } from '@/components/ui/button'

/**
 * `09` §Zero-result handling step 3 — the notify-me subscription. One click, idempotent on
 * the server, and the confirmation replaces the button: a subscription is not something to
 * do twice.
 */
export function SupplyGapWatch({ projectId }: { projectId: string }) {
  const t = useTranslations('results')
  const [pending, start] = useTransition()
  const [watching, setWatching] = useState(false)

  if (watching) {
    return (
      <p role="status" className="text-body-md">
        {t('watching')}
      </p>
    )
  }

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = (await watchSupplyGapAction({ projectId })) as
            { data: { watching: true } } | { error: unknown }
          if ('data' in result) setWatching(true)
        })
      }
    >
      {t('watchCta')}
    </Button>
  )
}
