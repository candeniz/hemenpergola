import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AdminShell } from '@/components/layouts/admin-shell'
import { AuditViewer } from '@/components/admin/audit-viewer'

import type { AuditEntryView } from '@/modules/audit/application/audit-service'

/**
 * `super_admin_audit_logs` — task 2.5. Read-only (`17` §Audit log).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function AuditPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const [t, { listAuditEntries, listAuditFacets }, { resolveActor }] = await Promise.all([
    getTranslations('admin.audit'),
    import('@/modules/audit/application/audit-service'),
    import('@/shared/context/actor'),
  ])

  const { headers } = await import('next/headers')
  const requestHeaders = await headers()
  const actor = await resolveActor({
    headers: { get: (name: string) => requestHeaders.get(name) },
  })

  const [page, facets] = await Promise.all([
    listAuditEntries(actor, { limit: 50 }),
    listAuditFacets(actor, {}),
  ])

  const entries: AuditEntryView[] = page.ok ? page.value.entries : []

  return (
    <AdminShell title={t('title')}>
      <p className="pb-md text-body-md text-muted">{t('subtitle')}</p>
      <AuditViewer
        entries={entries}
        nextCursor={page.ok ? page.value.nextCursor : null}
        actions={facets.ok ? facets.value.actions : []}
        entityTypes={facets.ok ? facets.value.entityTypes : []}
      />
    </AdminShell>
  )
}
