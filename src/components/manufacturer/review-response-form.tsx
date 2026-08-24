'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

import { respondToReviewAction } from '@/app/actions/review'
import { Button } from '@/components/ui/button'

/** `16` §Manufacturer response: one response, published immediately, no editing after. */
export function ReviewResponseForm({
  reviewId,
  companyId,
}: {
  reviewId: string
  companyId: string
}) {
  const t = useTranslations('reviews')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [body, setBody] = useState('')

  function submit() {
    start(async () => {
      setError(null)
      const result = (await respondToReviewAction({
        reviewId,
        companyId,
        body: body.trim(),
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
        {t('responded')}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-xs">
      <label className="flex flex-col gap-xs text-body-sm">
        {t('responseLabel')}
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={2000}
          rows={3}
          className="rounded-md border border-control-border bg-panel p-base text-body-sm"
        />
      </label>
      <div className="flex items-center gap-base">
        <Button variant="outline" disabled={pending || body.trim().length === 0} onClick={submit}>
          {t('respond')}
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
