import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { DashboardShell } from '@/components/layouts/dashboard-shell'

/**
 * `/hesap/bildirimler` — the in-app history (`13`: the `Notification` row IS the delivery;
 * 12.2 is the first surface that lists it, anywhere). The label per row is the same
 * `privacy.events.*` vocabulary the preferences screen uses, so what you can hear about
 * and what you heard about read as one list.
 *
 * `noindex` and dynamic: personal data (`07` §Rendering strategy); dynamic imports only
 * (non-negotiable 9).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const [t, events, { listNotifications }, { resolveActor }, { headers }] = await Promise.all([
    getTranslations({ locale, namespace: 'notificationsPage' }),
    getTranslations({ locale, namespace: 'privacy.events' }),
    import('@/modules/notification/application/inbox-service'),
    import('@/shared/context/actor'),
    import('next/headers'),
  ])

  const requestHeaders = await headers()
  const actor = await resolveActor({
    headers: { get: (name: string) => requestHeaders.get(name) },
  })

  const result = await listNotifications(actor, {})
  const notifications = result.ok ? result.value.notifications : []

  const formatter = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Istanbul',
  })

  return (
    <DashboardShell title={t('title')}>
      {!result.ok ? (
        <p role="alert" className="text-body-md text-destructive">
          {t('error')}
        </p>
      ) : notifications.length === 0 ? (
        <p className="text-body-md text-muted">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {notifications.map((notification) => (
            <li key={notification.id} className="flex items-baseline justify-between gap-4 py-3">
              <span className="text-body-md">{events(notification.type)}</span>
              <time className="shrink-0 text-body-sm text-muted">
                {formatter.format(notification.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </DashboardShell>
  )
}
