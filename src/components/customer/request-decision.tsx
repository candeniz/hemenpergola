'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

import { acceptOfferAction, rejectOfferAction } from '@/app/actions/offer'
import { Button } from '@/components/ui/button'

/** The customer's decision on a SENT offer — `OFFER_SENT → OFFER_ACCEPTED / REJECTED`. */
export function RequestDecision({ offerRequestId }: { offerRequestId: string }) {
  const t = useTranslations('requests')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function decide(action: typeof acceptOfferAction) {
    start(async () => {
      setError(null)
      const result = (await action({ offerRequestId })) as
        { data: unknown } | { error: { message: string } }
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
        {t('decided')}
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-base">
      <Button variant="confirm" disabled={pending} onClick={() => decide(acceptOfferAction)}>
        {t('acceptOffer')}
      </Button>
      <Button variant="outline" disabled={pending} onClick={() => decide(rejectOfferAction)}>
        {t('rejectOffer')}
      </Button>
      {error !== null ? (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
