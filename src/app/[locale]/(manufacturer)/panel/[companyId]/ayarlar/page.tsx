import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { PortalShell } from '@/components/layouts/portal-shell'

export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

import { CompanySettingsForm } from '@/components/manufacturer/supply-forms'

/**
 * `manufacturer_company_settings` — task 3.1.
 *
 * The company comes from the path, which is what `resolveActor` loads the membership for
 * (`12` §Context resolution). A member of two companies gets two portals, and neither can
 * be reached with the other's id.
 */
export default async function CompanySettingsPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string }>
}) {
  const { locale, companyId } = await params
  setRequestLocale(locale)

  const [t, { getCompanyProfile }, { resolveActor }] = await Promise.all([
    getTranslations('supply'),
    import('@/modules/iam/application/company-profile-service'),
    import('@/shared/context/actor'),
  ])

  const { headers } = await import('next/headers')
  const requestHeaders = await headers()
  const actor = await resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    { companyId },
  )

  const profile = await getCompanyProfile(actor, { companyId })

  return (
    <PortalShell title={t('settingsTitle')}>
      <p className="pb-md text-body-md text-muted">{t('settingsSubtitle')}</p>
      {profile.ok ? <CompanySettingsForm profile={profile.value} /> : null}
    </PortalShell>
  )
}
