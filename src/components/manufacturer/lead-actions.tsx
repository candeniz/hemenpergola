'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

import {
  acceptOfferRequestAction,
  completeAppointmentAction,
  declineOfferRequestAction,
  markLostAction,
  markWonAction,
  scheduleAppointmentAction,
  sendOfferAction,
} from '@/app/actions/offer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * The manufacturer's verbs on one lead — accept/decline (6.4), survey (6.7), offer (6.8),
 * outcome (6.9's tail). Every click is a machine transition on the server; this component
 * only collects inputs and refreshes. Deliberately status-driven: the server page passes
 * the current status and this renders exactly the verbs the machine would accept.
 */

type OfferLineDraft = { description: string; quantity: string; unit: string; unitPrice: string }

const EMPTY_LINE: OfferLineDraft = { description: '', quantity: '1', unit: 'adet', unitPrice: '' }

export function LeadActions({
  offerRequestId,
  companyId,
  status,
}: {
  offerRequestId: string
  companyId: string
  status: string
}) {
  const t = useTranslations('leads')
  const router = useRouter()
  const [lostReason, setLostReason] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [lines, setLines] = useState<OfferLineDraft[]>([EMPTY_LINE])

  function call(action: () => Promise<unknown>, onOk?: (result: unknown) => void) {
    start(async () => {
      setError(null)
      const result = (await action()) as { data?: unknown; error?: { message: string } }
      if (result.error !== undefined) {
        setError(result.error.message)
        return
      }
      onOk?.(result.data)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-md">
      {error !== null ? (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice !== null ? (
        <p role="status" className="text-body-md">
          {notice}
        </p>
      ) : null}

      {status === 'PENDING' ? (
        <div className="flex flex-col gap-base">
          <Button
            variant="confirm"
            disabled={pending}
            onClick={() => call(() => acceptOfferRequestAction({ offerRequestId, companyId }))}
          >
            {t('accept')}
          </Button>
          <div className="flex flex-wrap items-end gap-base">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="decline-reason">{t('declineReason')}</Label>
              <Input
                id="decline-reason"
                value={declineReason}
                onChange={(event) => setDeclineReason(event.target.value)}
                className="w-64"
              />
            </div>
            <Button
              variant="outline"
              disabled={pending || declineReason.trim() === ''}
              onClick={() =>
                call(() =>
                  declineOfferRequestAction({ offerRequestId, companyId, reason: declineReason }),
                )
              }
            >
              {t('decline')}
            </Button>
          </div>
        </div>
      ) : null}

      {status === 'ACCEPTED' || status === 'SURVEY_SCHEDULED' ? (
        <div className="flex flex-col gap-base">
          <p className="text-label-md uppercase text-muted">{t('scheduleTitle')}</p>
          <div className="flex flex-wrap items-end gap-base">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="survey-at">{t('scheduleTitle')}</Label>
              <Input
                id="survey-at"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </div>
            <Button
              disabled={pending || scheduledAt === ''}
              onClick={() =>
                call(() =>
                  scheduleAppointmentAction({
                    offerRequestId,
                    companyId,
                    scheduledAt: new Date(scheduledAt).toISOString(),
                    durationMin: 60,
                  }),
                )
              }
            >
              {t('scheduleCta')}
            </Button>
          </div>
          {status === 'SURVEY_SCHEDULED' ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                call(
                  () => completeAppointmentAction({ offerRequestId, companyId }),
                  () => setNotice(t('surveyDone')),
                )
              }
            >
              {t('completeCta')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {status === 'ACCEPTED' || status === 'SURVEY_SCHEDULED' || status === 'SURVEY_COMPLETED' ? (
        <div className="flex flex-col gap-base">
          <p className="text-label-md uppercase text-muted">{t('offerTitle')}</p>
          {lines.map((line, index) => (
            <div key={index} className="flex flex-wrap items-end gap-base">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor={`line-desc-${index}`}>{t('lineDescription')}</Label>
                <Input
                  id={`line-desc-${index}`}
                  value={line.description}
                  onChange={(event) =>
                    setLines(
                      lines.map((row, i) =>
                        i === index ? { ...row, description: event.target.value } : row,
                      ),
                    )
                  }
                  className="w-64"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <Label htmlFor={`line-qty-${index}`}>{t('lineQuantity')}</Label>
                <Input
                  id={`line-qty-${index}`}
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(event) =>
                    setLines(
                      lines.map((row, i) =>
                        i === index ? { ...row, quantity: event.target.value } : row,
                      ),
                    )
                  }
                  className="w-20"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <Label htmlFor={`line-unit-${index}`}>{t('lineUnit')}</Label>
                <Input
                  id={`line-unit-${index}`}
                  value={line.unit}
                  onChange={(event) =>
                    setLines(
                      lines.map((row, i) =>
                        i === index ? { ...row, unit: event.target.value } : row,
                      ),
                    )
                  }
                  className="w-20"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <Label htmlFor={`line-price-${index}`}>{t('lineUnitPrice')}</Label>
                <Input
                  id={`line-price-${index}`}
                  inputMode="numeric"
                  value={line.unitPrice}
                  onChange={(event) =>
                    setLines(
                      lines.map((row, i) =>
                        i === index ? { ...row, unitPrice: event.target.value } : row,
                      ),
                    )
                  }
                  className="w-32"
                />
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-base">
            <Button variant="outline" onClick={() => setLines([...lines, EMPTY_LINE])}>
              {t('addLine')}
            </Button>
            <Button
              disabled={
                pending ||
                lines.some(
                  (line) =>
                    line.description.trim() === '' ||
                    Number(line.quantity) <= 0 ||
                    Number(line.unitPrice) <= 0,
                )
              }
              onClick={() =>
                call(
                  () =>
                    sendOfferAction({
                      offerRequestId,
                      companyId,
                      lines: lines.map((line) => ({
                        description: line.description,
                        quantity: Number(line.quantity),
                        unit: line.unit,
                        // TL in the field, kuruş on the wire (`ADR-005`).
                        unitPriceKurus: Math.round(Number(line.unitPrice) * 100),
                      })),
                      validUntil: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
                    }),
                  (data) =>
                    setNotice(t('offerSent', { number: (data as { number: string }).number })),
                )
              }
            >
              {t('sendOffer')}
            </Button>
          </div>
        </div>
      ) : null}

      {status === 'OFFER_ACCEPTED' || status === 'OFFER_REJECTED' ? (
        <div className="flex flex-col gap-xs">
          <div className="flex flex-wrap items-center gap-base">
            {status === 'OFFER_ACCEPTED' ? (
              <Button
                variant="confirm"
                disabled={pending}
                onClick={() =>
                  call(
                    () => markWonAction({ offerRequestId, companyId }),
                    () => setNotice(t('won')),
                  )
                }
              >
                {t('markWon')}
              </Button>
            ) : null}
            <Button
              variant="outline"
              disabled={pending || lostReason.trim() === ''}
              onClick={() =>
                call(
                  () => markLostAction({ offerRequestId, companyId, reason: lostReason.trim() }),
                  () => setNotice(t('lost')),
                )
              }
            >
              {t('markLost')}
            </Button>
          </div>
          {/* The machine's guard requires a reason — won/lost tracking is only as good
              as the reasons it stores (11 §Outcome). */}
          <label className="flex flex-col gap-xs text-body-sm">
            {t('lostReasonLabel')}
            <input
              value={lostReason}
              onChange={(event) => setLostReason(event.target.value)}
              maxLength={500}
              className="rounded-md border border-control-border bg-panel p-base text-body-sm"
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
