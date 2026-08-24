'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

import { submitReviewAction } from '@/app/actions/review'
import { Button } from '@/components/ui/button'

/**
 * The review form — `16` §Content: four 1–5 dimensions plus title and body, overall
 * entered rather than derived. Submission lands in `PENDING` moderation, and the form
 * says so: the customer should not wonder why their review is not visible yet.
 */

const DIMENSIONS = [
  'ratingOverall',
  'ratingQuality',
  'ratingCommunication',
  'ratingTimeliness',
] as const
type Dimension = (typeof DIMENSIONS)[number]

export function ReviewForm({ offerRequestId }: { offerRequestId: string }) {
  const t = useTranslations('reviews')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ratings, setRatings] = useState<Record<Dimension, number>>({
    ratingOverall: 0,
    ratingQuality: 0,
    ratingCommunication: 0,
    ratingTimeliness: 0,
  })
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const complete =
    DIMENSIONS.every((dimension) => ratings[dimension] >= 1) && body.trim().length >= 50

  function submit() {
    start(async () => {
      setError(null)
      const result = (await submitReviewAction({
        offerRequestId,
        ...ratings,
        title: title.trim() === '' ? undefined : title.trim(),
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
      <p role="status" className="text-body-md">
        {t('submitted')}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-base">
      <h3 className="font-heading text-title-md">{t('formTitle')}</h3>

      {DIMENSIONS.map((dimension) => (
        <fieldset key={dimension} className="flex flex-wrap items-center gap-base">
          <legend className="text-body-sm">{t(`dimension.${dimension}`)}</legend>
          <div className="flex gap-xs" role="radiogroup" aria-label={t(`dimension.${dimension}`)}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={ratings[dimension] === value}
                aria-label={`${value}`}
                onClick={() => setRatings((existing) => ({ ...existing, [dimension]: value }))}
                className={
                  ratings[dimension] >= value
                    ? 'h-8 w-8 rounded-md bg-action text-on-action'
                    : 'h-8 w-8 rounded-md border border-control-border'
                }
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>
      ))}

      <label className="flex flex-col gap-xs text-body-sm">
        {t('titleLabel')}
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={100}
          className="rounded-md border border-control-border bg-panel p-base text-body-sm"
        />
      </label>

      <label className="flex flex-col gap-xs text-body-sm">
        {t('bodyLabel')}
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          minLength={50}
          maxLength={2000}
          rows={5}
          className="rounded-md border border-control-border bg-panel p-base text-body-sm"
        />
        <span className="text-label-sm text-muted">{t('bodyHint')}</span>
      </label>

      <div className="flex items-center gap-base">
        <Button disabled={pending || !complete} onClick={submit}>
          {t('submit')}
        </Button>
        <p className="text-body-sm text-muted">{t('moderationNote')}</p>
      </div>

      {error !== null ? (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
