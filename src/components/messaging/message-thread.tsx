'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

import {
  listThreadAsCompanyAction,
  listThreadAsCustomerAction,
  sendMessageAsCompanyAction,
  sendMessageAsCustomerAction,
} from '@/app/actions/messaging'
import { Button } from '@/components/ui/button'

/**
 * The one thread per request — `15-messaging.md`, `ADR-028`. Polling, not WebSocket
 * (`ADR-009`): 5 s while the tab is focused, 30 s in the background, stopped entirely on a
 * hidden tab. The list call is cursor-based, so the steady state is a small empty
 * response, and it doubles as the read-marker (`15` §Model).
 */

type MessageRow = {
  id: string
  sender: 'customer' | 'company'
  body: string
  sentAt: Date | string
}

type ThreadPayload = {
  requestStatus: string
  canSend: boolean
  messages: MessageRow[]
}

const FOCUSED_INTERVAL_MS = 5_000
const BLURRED_INTERVAL_MS = 30_000

export function MessageThread({
  offerRequestId,
  side,
  companyId,
}: {
  offerRequestId: string
  side: 'customer' | 'company'
  /** Required on the company side — the panel's route segment, for the actor. */
  companyId?: string
}) {
  const t = useTranslations('messaging')
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [canSend, setCanSend] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [sending, startSending] = useTransition()
  const lastIdRef = useRef<string | null>(null)

  const poll = useCallback(async () => {
    const input =
      side === 'customer'
        ? { offerRequestId, after: lastIdRef.current ?? undefined }
        : { offerRequestId, companyId, after: lastIdRef.current ?? undefined }
    const action = side === 'customer' ? listThreadAsCustomerAction : listThreadAsCompanyAction

    const result = (await action(input)) as { data: ThreadPayload } | { error: { message: string } }

    if ('error' in result) {
      setError(result.error.message)
      setLoaded(true)
      return
    }

    setError(null)
    setCanSend(result.data.canSend)
    if (result.data.messages.length > 0) {
      setMessages((existing) => {
        const known = new Set(existing.map((message) => message.id))
        const fresh = result.data.messages.filter((message) => !known.has(message.id))
        return fresh.length === 0 ? existing : [...existing, ...fresh]
      })
      lastIdRef.current =
        result.data.messages[result.data.messages.length - 1]?.id ?? lastIdRef.current
    }
    setLoaded(true)
  }, [offerRequestId, side, companyId])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false

    const schedule = () => {
      if (stopped || document.hidden) return
      const interval = document.hasFocus() ? FOCUSED_INTERVAL_MS : BLURRED_INTERVAL_MS
      timer = setTimeout(async () => {
        await poll()
        schedule()
      }, interval)
    }

    const onVisibility = () => {
      if (timer !== null) clearTimeout(timer)
      if (!document.hidden) {
        void poll()
        schedule()
      }
    }

    void poll()
    schedule()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)
    window.addEventListener('blur', onVisibility)

    return () => {
      stopped = true
      if (timer !== null) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
      window.removeEventListener('blur', onVisibility)
    }
  }, [poll])

  function send() {
    const trimmed = body.trim()
    if (trimmed.length === 0) return

    startSending(async () => {
      setError(null)
      const input =
        side === 'customer'
          ? { offerRequestId, body: trimmed }
          : { offerRequestId, companyId, body: trimmed }
      const action = side === 'customer' ? sendMessageAsCustomerAction : sendMessageAsCompanyAction

      const result = (await action(input)) as { data: unknown } | { error: { message: string } }

      if ('error' in result) {
        setError(result.error.message)
        return
      }
      setBody('')
      await poll()
    })
  }

  return (
    <section aria-label={t('title')} className="flex flex-col gap-base">
      <h2 className="font-heading text-title-md">{t('title')}</h2>

      {!loaded ? (
        <p className="text-body-sm text-muted">{t('loading')}</p>
      ) : messages.length === 0 ? (
        <p className="text-body-sm text-muted">{t('empty')}</p>
      ) : (
        <ol className="flex flex-col gap-xs">
          {messages.map((message) => (
            <li
              key={message.id}
              className={
                message.sender === side
                  ? 'self-end rounded-md bg-panel-subtle px-base py-xs text-body-sm'
                  : 'self-start rounded-md border border-control-border px-base py-xs text-body-sm'
              }
            >
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
              <p className="text-label-sm text-muted">
                {new Date(message.sentAt).toLocaleString('tr-TR', {
                  timeZone: 'Europe/Istanbul',
                })}
              </p>
            </li>
          ))}
        </ol>
      )}

      {canSend ? (
        <div className="flex flex-col gap-xs">
          <label className="flex flex-col gap-xs text-body-sm">
            {t('inputLabel')}
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={4000}
              rows={3}
              className="rounded-md border border-control-border bg-panel p-base text-body-sm"
            />
          </label>
          <div className="flex items-center gap-base">
            <Button disabled={sending || body.trim().length === 0} onClick={send}>
              {t('send')}
            </Button>
          </div>
        </div>
      ) : loaded ? (
        <p className="text-body-sm text-muted">{t('closed')}</p>
      ) : null}

      {error !== null ? (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}
