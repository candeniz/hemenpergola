import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AccountErasure } from '@/components/customer/account-erasure'
import { DataExportRequest } from '@/components/customer/data-export-request'
import {
  NotificationPreferences,
  type PreferenceRow,
} from '@/components/customer/notification-preferences'
import { DashboardShell } from '@/components/layouts/dashboard-shell'

/**
 * `/hesap/verilerim` — the account's controls over its own data, task 10.2.
 *
 * `19` §Data subject rights names this exact path for access and portability, and has
 * named it since Phase 0. Nothing was ever built at it: `requestDataExport`,
 * `anonymiseAccount`, `listNotificationPreferences` and `setNotificationPreference` all
 * existed as services with authorisation entries and passing integration tests, reachable
 * from no page, no action and no route. Phase 9 asked whether the services worked; nobody
 * asked whether a person could get to them. `test/api-surface.test.ts` is what noticed.
 *
 * Three of the four rights `19` lists live here — access/portability, erasure, and
 * objection/restriction via preferences. Rectification is profile editing, which is
 * elsewhere and does exist.
 *
 * `noindex` and dynamic: personal data, never cached (`07` §Rendering strategy). Imports
 * are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function MyDataPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const [t, preferences, { resolveActor }, { headers }] = await Promise.all([
    getTranslations({ locale, namespace: 'privacy' }),
    import('@/modules/notification/application/preference-service'),
    import('@/shared/context/actor'),
    import('next/headers'),
  ])

  const requestHeaders = await headers()
  const actor = await resolveActor({
    headers: { get: (name: string) => requestHeaders.get(name) },
  })

  const stored = await preferences.listNotificationPreferences(actor, {})

  /*
   * Absence of a row means enabled (`13` §Preferences), so the catalogue is the spine and
   * the stored rows are the exceptions laid over it. Reversing that — rendering the rows —
   * would show a new account an empty settings screen.
   */
  const off = new Set(
    (stored.ok ? stored.value : [])
      .filter((row) => !row.enabled)
      .map((row) => `${row.channel}:${row.type}`),
  )

  const rows: PreferenceRow[] = preferences.PREFERENCE_EVENT_TYPES.map((type) => ({
    type,
    mandatory: preferences.isMandatory(type),
    email: !off.has(`email:${type}`),
    sms: !off.has(`sms:${type}`),
  }))

  return (
    <DashboardShell title={t('title')}>
      <div className="space-y-10">
        <section aria-labelledby="prefs-heading" className="space-y-4">
          <div>
            <h2 id="prefs-heading" className="text-title-md">
              {t('preferences.title')}
            </h2>
            <p className="text-body-md text-muted">{t('preferences.intro')}</p>
          </div>
          <NotificationPreferences rows={rows} />
        </section>

        <section aria-labelledby="export-heading" className="space-y-4">
          <div>
            <h2 id="export-heading" className="text-title-md">
              {t('export.title')}
            </h2>
            <p className="text-body-md text-muted">{t('export.intro')}</p>
          </div>
          <DataExportRequest />
        </section>

        <section aria-labelledby="erase-heading" className="space-y-4">
          <div>
            <h2 id="erase-heading" className="text-title-md">
              {t('erase.title')}
            </h2>
            {/* What survives anonymisation, said before the button rather than after. */}
            <p className="text-body-md text-muted">{t('erase.intro')}</p>
            <p className="text-body-md text-muted">{t('erase.survives')}</p>
          </div>
          <AccountErasure />
        </section>
      </div>
    </DashboardShell>
  )
}
