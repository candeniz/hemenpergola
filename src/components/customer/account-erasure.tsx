'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

import { anonymiseAccountAction } from '@/app/actions/privacy'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * `19` §Data subject rights — erasure, which is **anonymisation** (`ADR-011`).
 *
 * Three gates before the call, because this is the one control on the site that cannot be
 * undone:
 *
 *  1. the destructive form is behind a disclosure — the default state is a description of
 *     what will happen and what will survive, not a button;
 *  2. the account's own email address, typed. The service enforces this
 *     (`anonymiseAccountSchema.confirmEmail` + a `PRECONDITION` on mismatch), so it holds
 *     for the route handler and the mobile client too — this field is the way to satisfy
 *     it, not the check itself;
 *  3. an explicit acknowledgement that it is irreversible, checked by hand.
 *
 * **What is still missing, and is recorded rather than papered over:** `19` §Data subject
 * rights describes erasure as *"account deletion request → verification → anonymisation
 * job"*. Gates 1–3 are the request and its confirmation; there is no separate emailed
 * **verification** step, because that needs a service method and an `AuthToken` purpose
 * that do not exist. `29` A2 says so, and `25` §Open questions carries it as Q30.
 */
export function AccountErasure() {
  const t = useTranslations('privacy')
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

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
          const result = (await anonymiseAccountAction({ confirmEmail: email })) as
            { data: unknown } | { error: { message: string } }

          if ('data' in result) {
            // The session belongs to an account that no longer identifies anyone; a full
            // reload lands on the sign-in wall rather than leaving a stale personal page.
            window.location.assign('/')
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
