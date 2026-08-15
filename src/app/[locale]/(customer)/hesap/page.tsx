import { getTranslations, setRequestLocale } from 'next-intl/server'

import { DashboardShell } from '@/components/layouts/dashboard-shell'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'

export default async function CustomerDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'nav.customer' })
  const shell = await getTranslations({ locale, namespace: 'shell' })

  return (
    <DashboardShell title={t('dashboard')}>
      <Card>
        <CardTitle>{shell('placeholderUser')}</CardTitle>
        <CardDescription>{shell('placeholderNotice')}</CardDescription>
      </Card>
    </DashboardShell>
  )
}
