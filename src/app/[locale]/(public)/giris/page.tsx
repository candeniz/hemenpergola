import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AuthCard } from '@/components/auth/auth-card'
import { LoginForm } from '@/components/auth/forms'
import { PublicShell } from '@/components/layouts/public-shell'
import { Link } from '@/i18n/navigation'

/**
 * Sign in — row 1.4. Screen reference: `auth_login`.
 *
 * Server component around a client form: the shell, the copy and the links render on the
 * server in both locales; only the form is interactive.
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('auth')

  return (
    <PublicShell>
      <AuthCard
        title={t('login.title')}
        description={t('login.subtitle')}
        footer={
          <>
            {t('login.noAccount')}{' '}
            <Link href="/kayit" className="text-action underline-offset-4 hover:underline">
              {t('login.register')}
            </Link>
          </>
        }
      >
        <LoginForm />
      </AuthCard>
    </PublicShell>
  )
}
