import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AuthCard } from '@/components/auth/auth-card'
import { VerifyPhoneForm } from '@/components/auth/forms'
import { PublicShell } from '@/components/layouts/public-shell'

/**
 * Phone verification — `26-execution-plan.md` row 1.5.
 *
 * The provider name is read here and passed down, so the screen can say out loud that the
 * code is going to the server log rather than to a phone. Q3 is open — there is no provider
 * to call yet — and a silent no-op would look exactly like a delivery failure.
 *
 * `await import` rather than a static one: `env` at module scope in `app/` puts the
 * secrets back in the build (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const [t, { env }] = await Promise.all([getTranslations('auth'), import('@/shared/config/env')])

  return (
    <PublicShell>
      <AuthCard title={t('verifyPhone.title')} description={t('verifyPhone.subtitle')}>
        <VerifyPhoneForm smsProvider={env.SMS_PROVIDER} />
      </AuthCard>
    </PublicShell>
  )
}
