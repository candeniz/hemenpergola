import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AuthCard } from '@/components/auth/auth-card'
import { VerifyEmailPanel } from '@/components/auth/forms'
import { PublicShell } from '@/components/layouts/public-shell'

/**
 * Email verification — row 1.4. Screen reference: `auth_verify_email`.
 *
 * The link in the email lands here. The token is consumed by the panel on mount, because the
 * user already clicked once and a second confirmation button would exist only because it was
 * easier to build.
 */
// Task 9.3: request-time render so the CSP nonce lands on the inline scripts — the
// auth surfaces are exactly where the strict script-src profile matters.
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
  const t = await getTranslations('auth')

  return (
    <PublicShell>
      <AuthCard title={t('verifyEmail.title')}>
        <VerifyEmailPanel token={token ?? null} />
      </AuthCard>
    </PublicShell>
  )
}
