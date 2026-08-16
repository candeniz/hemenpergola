import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AdminShell } from '@/components/layouts/admin-shell'
import { VerificationQueue } from '@/components/admin/verification-queue'

import type { QueueEntry } from '@/modules/iam/application/verification-service'

/**
 * `super_admin_manufacturer_verification` — task 2.4.
 *
 * `07` §Route map puts manufacturer management and the verification queue on the same
 * route; the queue is what an admin comes here to do, so the queue is what the page opens
 * on. Management of already-verified companies arrives with the screens that need it.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function VerificationPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const [t, { listVerificationQueue }, { resolveActor }] = await Promise.all([
    getTranslations('admin.verification'),
    import('@/modules/iam/application/verification-service'),
    import('@/shared/context/actor'),
  ])

  const { headers } = await import('next/headers')
  const requestHeaders = await headers()
  const actor = await resolveActor({
    headers: { get: (name: string) => requestHeaders.get(name) },
  })

  const queue = await listVerificationQueue(actor, {})
  const companies: QueueEntry[] = queue.ok ? queue.value.companies : []

  return (
    <AdminShell title={t('title')}>
      <p className="pb-md text-body-md text-muted">{t('subtitle')}</p>
      <VerificationQueue companies={companies} />
    </AdminShell>
  )
}
