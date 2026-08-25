'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

import { requestAccountErasureAction } from '@/app/actions/privacy'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * `19` §Data subject rights — erasure, which is **anonymisation** (`ADR-011`).
 *
 * Submitting does not erase. It starts `19`'s "request → verification → anonymisation"
 * (Q30): the service emails a one-hour single-use link, and `/hesap-silme-onay` is where
 * the anonymisation actually runs. What this form's gates are for is honesty at the point
 * of asking:
 *
 *  1. the form is behind a disclosure — the default state describes what will happen and
 *     what survives, not a button;
 *  2. the account's own email address, typed. A deliberate speed bump the service checks
 *     (`PRECONDITION` on mismatch) — a thinking tool, not a second factor: the thing that
 *     authorises the erasure is the emailed token;
 *  3. an explicit acknowledgement that it is irreversible, checked by hand.
 */
export function AccountErasure() {
  const t = useTranslations('privacy')
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, start] = useTransition()

  if (sent) {
    return (
      <p role="status" className="text-body-md">
        {t('erase.sent')}
      </p>
    )
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t('erase.reveal')}
      </Button>
    )
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)

        start(async () => {
          const result = (await requestAccountErasureAction({ confirmEmail: email })) as
            { data: unknown } | { error: { message: string } }

          if ('data' in result) {
            setSent(true)
            return
          }
          setError(t('erase.failed'))
        })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="erase-confirm-email">{t('erase.confirmLabel')}</Label>
        <Input
          id="erase-confirm-email"
          type="email"
          autoComplete="off"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="flex items-start gap-2">
        <Checkbox
          id="erase-acknowledge"
          checked={acknowledged}
          onCheckedChange={(next) => setAcknowledged(next === true)}
        />
        <Label htmlFor="erase-acknowledge" className="text-body-sm font-normal">
          {t('erase.acknowledge')}
        </Label>
      </div>

      {error === null ? null : (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" variant="destructive" disabled={pending || !acknowledged}>
          {t('erase.submit')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t('erase.cancel')}
        </Button>
      </div>
    </form>
  )
}
