import { getTranslations, setRequestLocale } from 'next-intl/server'

import { PortalShell } from '@/components/layouts/portal-shell'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'

export default async function ManufacturerPortalPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'nav.manufacturer' })
  const shell = await getTranslations({ locale, namespace: 'shell' })

  return (
    <PortalShell title={t('dashboard')}>
      <Card density="dense">
        <CardTitle>{shell('placeholderCompany')}</CardTitle>
        <CardDescription>{shell('placeholderNotice')}</CardDescription>
      </Card>
    </PortalShell>
  )
}
