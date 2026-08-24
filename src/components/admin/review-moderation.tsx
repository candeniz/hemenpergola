'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

import { moderateReviewAction } from '@/app/actions/review'
import { Button } from '@/components/ui/button'

/**
 * The moderation decision — `16` §Moderation. Rejection requires a reason (the customer
 * is notified with it), and a negative review is not a rejection ground: the grounds are
 * narrow and the reason box is where the moderator names one.
 */
export function ReviewModeration({ reviewId }: { reviewId: string }) {
  const t = useTranslations('reviews')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  function decide(decision: 'PUBLISHED' | 'REJECTED') {
    start(async () => {
      setError(null)
      const result = (await moderateReviewAction({
        reviewId,
        decision,
        reason: decision === 'REJECTED' ? reason.trim() : undefined,
      })) as { data: unknown } | { error: { message: string } }

      if ('error' in result) {
        setError(result.error.message)
        return
      }
      setDone(decision)
      router.refresh()
    })
  }

  if (done !== null) {
    return (
      <p role="status" className="text-body-sm">
        {t(`moderated.${done}`)}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-xs">
      <div className="flex flex-wrap items-center gap-base">
        <Button variant="confirm" disabled={pending} onClick={() => decide('PUBLISHED')}>
          {t('publish')}
        </Button>
        <Button
          variant="outline"
          disabled={pending || reason.trim().length === 0}
          onClick={() => decide('REJECTED')}
        >
          {t('reject')}
        </Button>
      </div>
      <label className="flex flex-col gap-xs text-body-sm">
        {t('rejectReasonLabel')}
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          className="rounded-md border border-control-border bg-panel p-base text-body-sm"
        />
      </label>
      {error !== null ? (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
