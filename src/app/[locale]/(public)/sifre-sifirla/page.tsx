import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AuthCard } from '@/components/auth/auth-card'
import { ForgotPasswordForm } from '@/components/auth/forms'
import { PublicShell } from '@/components/layouts/public-shell'
import { Link } from '@/i18n/navigation'

/**
 * Request a reset link — row 1.4. Screen reference: `auth_forgot_password`.
 *
 * Server component around a client form: the shell, the copy and the links render on the
 * server in both locales; only the form is interactive.
 */
// Task 9.3: request-time render so the CSP nonce lands on the inline scripts — the
// auth surfaces are exactly where the strict script-src profile matters.
export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('auth')

  return (
    <PublicShell>
      <AuthCard
        title={t('forgot.title')}
        description={t('forgot.subtitle')}
        footer={
          <Link href="/giris" className="text-action underline underline-offset-4">
            {t('forgot.backToLogin')}
          </Link>
        }
      >
        <ForgotPasswordForm />
      </AuthCard>
    </PublicShell>
  )
}
