import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { PortalShell } from '@/components/layouts/portal-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { redirect } from '@/i18n/navigation'

export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * `/panel` — the portal's front door, task 13.8.
 *
 * It used to render a placeholder card (`placeholderCompany` / `placeholderNotice`), which
 * was honest in Phase 3 and stopped being so the moment the company-scoped pages existed.
 *
 * **One membership redirects; more than one chooses.** The redirect is the right default
 * because a manufacturer with one company has no decision to make, and a chooser that always
 * asks a one-answer question is a page nobody reads — they click through it and resent it.
 * Two or more is a real choice and gets a real screen. Zero memberships gets a sentence
 * saying who can fix that, because the fix is somebody else's invitation, not a retry.
 *
 * `listMyCompanies` is the same derivation `ADR-030` uses to decide which shell the mobile
 * app opens into. One question, one answer, both clients.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export default async function PortalEntry({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const [t, { listMyCompanies }, { resolveActor }] = await Promise.all([
    getTranslations('portal'),
    import('@/modules/iam/application/my-companies-service'),
    import('@/shared/context/actor'),
  ])

  const { headers } = await import('next/headers')
  const requestHeaders = await headers()
  const actor = await resolveActor({
    headers: { get: (name: string) => requestHeaders.get(name) },
  })

  const result = await listMyCompanies(actor, {})
  const companies = result.ok ? result.value.companies : []

  if (companies.length === 1) {
    const only = companies[0]
    if (only !== undefined) redirect({ href: `/panel/${only.companyId}`, locale })
  }

  return (
    <PortalShell title={t('chooser.title')}>
      <Card>
        <CardHeader>
          <CardTitle>{t('chooser.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {companies.length === 0 ? (
            <p className="text-body-md text-muted">{t('chooser.none')}</p>
          ) : (
            <>
              <p className="pb-base text-body-md text-muted">{t('chooser.body')}</p>
              <ul className="flex flex-col gap-sm">
                {companies.map((company) => (
                  <li
                    key={company.companyId}
                    className="flex items-center justify-between gap-sm border-b border-divider pb-sm last:border-b-0"
                  >
                    <span className="text-body-md text-on-panel">{company.displayName}</span>
                    <Link
                      href={`/panel/${company.companyId}`}
                      className="text-label-md text-action hover:underline"
                    >
                      {t('chooser.open')}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </PortalShell>
  )
}
