import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AuthCard } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { PublicShell } from '@/components/layouts/public-shell'
import { Link } from '@/i18n/navigation'

/**
 * The 403 boundary — `26-execution-plan.md` row 1.4:
 * *"`access_denied_permission_required` → a real 403 screen"*.
 *
 * It exists as a route, not only as an error boundary, because a `FORBIDDEN` result has to
 * land somewhere a person can act from. It names the permission when one is passed, and
 * offers the two things that actually resolve the situation: sign in as someone else, or
 * leave. It never explains *why* the permission is missing — that would describe the
 * authorisation model to whoever is probing it.
 */
// Task 9.3: request-time render so the CSP nonce lands on the inline scripts — the
// auth surfaces are exactly where the strict script-src profile matters.
export const dynamic = 'force-dynamic'

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ permission?: string }>
}) {
  const [{ locale }, { permission }] = await Promise.all([params, searchParams])
  setRequestLocale(locale)
  const t = await getTranslations('auth')

  return (
    <PublicShell>
      <AuthCard title={t('forbidden.title')} description={t('forbidden.body')}>
        {permission === undefined ? null : (
          <p className="text-body-sm text-muted">{t('forbidden.permission', { permission })}</p>
        )}
        <div className="flex flex-col gap-base sm:flex-row">
          <Button asChild variant="primary" size="touch">
            <Link href="/giris">{t('forbidden.switchAccount')}</Link>
          </Button>
          <Button asChild variant="ghost" size="touch">
            <Link href="/">{t('forbidden.home')}</Link>
          </Button>
        </div>
      </AuthCard>
    </PublicShell>
  )
}
