'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

import { setNotificationPreferenceAction } from '@/app/actions/privacy'
import { Switch } from '@/components/ui/switch'

/**
 * `13` §Preferences on the surface — one switch per (channel, event type).
 *
 * **Absence of a row means enabled**, which is the model's own rule, so the initial state
 * comes from the catalogue with stored rows layered on top rather than from the rows alone.
 * A page that rendered `listNotificationPreferences()` directly would show a new account
 * nothing at all.
 *
 * Mandatory events (`ADR-027`) render as a disabled, checked switch with the reason beside
 * it. Hiding them would be tidier and worse: the user would have no way to learn why one
 * notification keeps arriving. The refusal is enforced in the service either way — this is
 * an explanation, not a guard.
 */

export type PreferenceRow = {
  type: string
  mandatory: boolean
  email: boolean
  sms: boolean
  /** 12.3 — the phone joins the same catalogue with the same ADR-027 rules. */
  push: boolean
}

export function NotificationPreferences({ rows }: { rows: PreferenceRow[] }) {
  const t = useTranslations('privacy')
  const [state, setState] = useState(rows)
  const [pending, start] = useTransition()

  const toggle = (type: string, channel: 'email' | 'sms' | 'push', enabled: boolean) => {
    // Optimistic, then reconciled: a failed write puts the switch back where it was, so the
    // screen never claims a preference the server refused (mandatory events do refuse).
    setState((current) =>
      current.map((row) => (row.type === type ? { ...row, [channel]: enabled } : row)),
    )

    start(async () => {
      const result = (await setNotificationPreferenceAction({ channel, type, enabled })) as
        { data: unknown } | { error: unknown }

      if (!('data' in result)) {
        setState((current) =>
          current.map((row) => (row.type === type ? { ...row, [channel]: !enabled } : row)),
        )
      }
    })
  }

  return (
    <table className="w-full text-body-md">
      <caption className="sr-only">{t('preferences.caption')}</caption>
      <thead>
        <tr className="border-b border-hairline text-left text-body-sm text-muted">
          <th scope="col" className="py-2">
            {t('preferences.event')}
          </th>
          <th scope="col" className="w-24 py-2">
            {t('preferences.email')}
          </th>
          <th scope="col" className="w-24 py-2">
            {t('preferences.sms')}
          </th>
          <th scope="col" className="w-24 py-2">
            {t('preferences.push')}
          </th>
        </tr>
      </thead>
      <tbody>
        {state.map((row) => (
          <tr key={row.type} className="border-b border-hairline">
            <th scope="row" className="py-3 pr-4 text-left font-normal">
              {t(`events.${row.type}`)}
              {row.mandatory ? (
                <span className="block text-body-sm text-muted">{t('preferences.mandatory')}</span>
              ) : null}
            </th>
            {(['email', 'sms', 'push'] as const).map((channel) => (
              <td key={channel} className="py-3">
                <Switch
                  checked={row[channel]}
                  disabled={row.mandatory || pending}
                  aria-label={t(`preferences.${channel}Label`, { event: t(`events.${row.type}`) })}
                  onCheckedChange={(next) => toggle(row.type, channel, next)}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
