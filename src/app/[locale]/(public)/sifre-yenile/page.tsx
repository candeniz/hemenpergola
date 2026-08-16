import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AuthCard } from '@/components/auth/auth-card'
import { ResetPasswordForm } from '@/components/auth/forms'
import { PublicShell } from '@/components/layouts/public-shell'

/**
 * Set a new password from a reset link — row 1.4. Screen reference: `auth_reset_password`.
 *
 * The token arrives in the query string and is handed to the form as a prop. It is never
 * put in a hidden field the page renders from a database read: the only thing the page knows
 * about the token is the string in the URL, and the service is what decides whether it is
 * real. A missing or empty token renders the invalid state rather than an empty form.
 */
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
      <AuthCard title={t('reset.title')} description={t('reset.subtitle')}>
        <ResetPasswordForm token={token ?? null} />
      </AuthCard>
    </PublicShell>
  )
}
