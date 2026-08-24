import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AuthCard } from '@/components/auth/auth-card'
import { RegisterForm } from '@/components/auth/forms'
import { PublicShell } from '@/components/layouts/public-shell'
import { Link } from '@/i18n/navigation'

/**
 * Registration — `26-execution-plan.md` row 1.4. Screen reference: `auth_register`.
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
        title={t('register.title')}
        description={t('register.subtitle')}
        footer={
          <>
            {t('register.haveAccount')}{' '}
            {/* Underlined always: inside a sentence the underline is what makes the link
                visible to someone who cannot see the colour difference (WCAG 1.4.1). */}
            <Link href="/giris" className="text-action underline underline-offset-4">
              {t('register.signIn')}
            </Link>
          </>
        }
      >
        <RegisterForm />
      </AuthCard>
    </PublicShell>
  )
}
