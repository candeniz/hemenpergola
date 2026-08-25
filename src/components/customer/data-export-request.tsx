'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

import { requestDataExportAction } from '@/app/actions/privacy'
import { Button } from '@/components/ui/button'

/**
 * `19` §Data subject rights — access and portability, the half that had no surface.
 *
 * The package is built and mailed as a signed link rather than streamed here, because it
 * is assembled from six tables and the link is what `19` promises (30 days, target 72 h).
 * So the button's success state is "check your email", not a download.
 */
export function DataExportRequest() {
  const t = useTranslations('privacy')
  const [pending, start] = useTransition()
  const [state, setState] = useState<'idle' | 'sent' | 'failed'>('idle')

  if (state === 'sent') {
    return (
      <p role="status" className="text-body-md">
        {t('export.sent')}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = (await requestDataExportAction({})) as
              { data: unknown } | { error: unknown }
            setState('data' in result ? 'sent' : 'failed')
          })
        }
      >
        {t('export.cta')}
      </Button>
      {state === 'failed' ? (
        <p role="alert" className="text-body-sm text-destructive">
          {t('export.failed')}
        </p>
      ) : null}
    </div>
  )
}
