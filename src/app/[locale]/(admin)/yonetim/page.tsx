import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AdminShell } from '@/components/layouts/admin-shell'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'

/** 07 §Rendering strategy: the admin surface is never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'nav.admin' })
  const shell = await getTranslations({ locale, namespace: 'shell' })

  return (
    <AdminShell title={t('dashboard')}>
      <Card density="dense">
        <CardTitle>{t('section')}</CardTitle>
        <CardDescription>{shell('placeholderNotice')}</CardDescription>
      </Card>
    </AdminShell>
  )
}
