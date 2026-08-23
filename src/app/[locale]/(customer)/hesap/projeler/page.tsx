import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { ProjectList } from '@/components/customer/project-list'
import { DashboardShell } from '@/components/layouts/dashboard-shell'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

/**
 * `/hesap/projeler` — the customer's own project list (`07` §Route map, task 4.8).
 *
 * The same list the dashboard leads with, at the route the navigation points at. It is not a
 * redirect to `/hesap`, because `07` §Route map gives the two rows different screens and
 * Phase 5 gives this one filters the dashboard will not have.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function CustomerProjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const [t, nav, { listProjects }, { resolveActor }, { headers }] = await Promise.all([
    getTranslations({ locale, namespace: 'projects' }),
    getTranslations({ locale, namespace: 'nav.customer' }),
    import('@/modules/project/application/project-service'),
    import('@/shared/context/actor'),
    import('next/headers'),
  ])

  const requestHeaders = await headers()
  const actor = await resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    { locale },
  )

  const listed = await listProjects(actor, {})

  return (
    <DashboardShell title={nav('projects')}>
      <div className="flex flex-col gap-md">
        <div className="flex flex-wrap items-center justify-between gap-base">
          <h1 className="font-heading text-headline-md">{nav('projects')}</h1>
          <Button asChild>
            <Link href="/proje/yeni">{t('startNew')}</Link>
          </Button>
        </div>

        <ProjectList projects={listed.ok ? listed.value.projects : []} />
      </div>
    </DashboardShell>
  )
}
