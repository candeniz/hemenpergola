'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

import { confirmAccountErasureAction } from '@/app/actions/privacy'
import { Button } from '@/components/ui/button'

/**
 * The landing form for the erasure email's link — the "verification" in `19`'s
 * "request → verification → anonymisation" (Q30).
 *
 * A page with a button rather than a link that acts: mail clients and link scanners
 * prefetch URLs, and a prefetch must never anonymise an account. The token authorises; the
 * click is the human. After success there is nothing to return to — the session's account
 * no longer identifies anyone — so the confirmation replaces the page and the only exit is
 * the homepage.
 */
export function ErasureConfirm({ token }: { token: string | null }) {
  const t = useTranslations('privacy')
  const [pending, start] = useTransition()
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')

  if (token === null || token === '') {
    return (
      <p role="alert" className="text-body-md">
        {t('confirm.missingToken')}
      </p>
    )
  }

  if (state === 'done') {
    return (
      <p role="status" className="text-body-md">
        {t('confirm.done')}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-body-md">{t('confirm.warning')}</p>
      {state === 'failed' ? (
        <p role="alert" className="text-body-sm text-destructive">
          {t('confirm.failed')}
        </p>
      ) : null}
      <Button
        variant="destructive"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = (await confirmAccountErasureAction({ token })) as
              { data: unknown } | { error: unknown }
            setState('data' in result ? 'done' : 'failed')
          })
        }
      >
        {t('confirm.cta')}
      </Button>
    </div>
  )
}
