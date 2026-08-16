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
            <Link href="/giris" className="text-action underline-offset-4 hover:underline">
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
