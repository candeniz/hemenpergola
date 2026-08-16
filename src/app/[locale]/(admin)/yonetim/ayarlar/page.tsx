import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { SettingsManager } from '@/components/admin/settings-manager'
import { AdminShell } from '@/components/layouts/admin-shell'

import type { SettingView } from '@/modules/platform/application/settings-service'

/**
 * Platform settings — task 2.7, `ADM-06`.
 *
 * `17` §Platform settings is the specification; there is no Stitch screen for it, so the
 * layout is the dense card list the rest of the admin surface uses.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const [t, { listSettings }, { resolveActor }] = await Promise.all([
    getTranslations('admin.settings'),
    import('@/modules/platform/application/settings-service'),
    import('@/shared/context/actor'),
  ])

  const { headers } = await import('next/headers')
  const requestHeaders = await headers()
  const actor = await resolveActor({
    headers: { get: (name: string) => requestHeaders.get(name) },
  })

  const result = await listSettings(actor, {})
  const settings: SettingView[] = result.ok ? result.value.settings : []

  return (
    <AdminShell title={t('title')}>
      <p className="pb-md text-body-md text-muted">{t('subtitle')}</p>
      <SettingsManager settings={settings} />
    </AdminShell>
  )
}
