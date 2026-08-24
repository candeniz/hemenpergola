'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

import { closeOfferRequestAction } from '@/app/actions/offer'
import { Button } from '@/components/ui/button'

/**
 * Admin close — `11` §Transition table's `close` edge, which had a machine row and a
 * guard from Phase 6 and no surface until now. The reason is required by the machine
 * itself (`requireReason`), so the button stays disabled without one: a closed request
 * with no recorded reason is a state change nobody can explain later.
 */
export function RequestClose({ offerRequestId }: { offerRequestId: string }) {
  const t = useTranslations('admin.requests')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [reason, setReason] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    start(async () => {
      setError(null)
      const result = (await closeOfferRequestAction({
        offerRequestId,
        reason: reason.trim(),
      })) as { data: unknown } | { error: { message: string } }

      if ('error' in result) {
        setError(result.error.message)
        return
      }
      setDone(true)
      router.refresh()
    })
  }

  if (done) {
    return (
      <p role="status" className="text-body-sm">
        {t('closed')}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-xs">
      <label className="flex flex-col gap-xs text-body-sm">
        {t('reasonLabel')}
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          className="rounded-md border border-control-border bg-panel p-base text-body-sm"
        />
      </label>
      <div>
        <Button variant="outline" disabled={pending || reason.trim() === ''} onClick={close}>
          {t('close')}
        </Button>
      </div>
      {error !== null ? (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
