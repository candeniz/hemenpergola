import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AuthCard } from '@/components/auth/auth-card'
import { ErasureConfirm } from '@/components/customer/erasure-confirm'
import { PublicShell } from '@/components/layouts/public-shell'

/**
 * `/hesap-silme-onay?token=` — where the erasure email's link lands (Q30).
 *
 * Public, like `sifre-yenile`, and for the same reason: the person opening the link may
 * no longer have a live session, and the token is the credential — putting this behind the
 * customer auth wall would bounce exactly the person `19` §Erasure is written for. Same
 * token discipline too: the page knows only the string in the URL; the service decides
 * whether it is real, live and unused.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const [{ locale }, { token }] = await Promise.all([params, searchParams])
  setRequestLocale(locale)
  const t = await getTranslations('privacy')

  return (
    <PublicShell>
      <AuthCard title={t('confirm.title')} description={t('confirm.subtitle')}>
        <ErasureConfirm token={token ?? null} />
      </AuthCard>
    </PublicShell>
  )
}
