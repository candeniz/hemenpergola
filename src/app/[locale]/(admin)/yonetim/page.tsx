import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AdminShell } from '@/components/layouts/admin-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'

/**
 * `super_admin_command_center_final` — task 2.6.
 *
 * *"It is a work queue, not a vanity dashboard"* (`17` §Command center). Top row is things
 * waiting on an admin; below that, health numbers.
 *
 * Four of the six queues have no table yet — reviews, complaints, the notification
 * dead-letter and zero-result districts all arrive with their phases. They are rendered as
 * **named and explicitly not-yet**, rather than as a zero. A zero and "this does not exist"
 * look identical on a dashboard and mean opposite things, and the one that gets ignored is
 * the real zero.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

type Tile = { labelKey: string; value: number | null; href?: string }

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const [t, { dashboardCounts }, { resolveActor }, { headers }] = await Promise.all([
    getTranslations('admin.commandCenter'),
    import('@/modules/platform/application/settings-service'),
    import('@/shared/context/actor'),
    import('next/headers'),
  ])

  const requestHeaders = await headers()
  const actor = await resolveActor({ headers: { get: (name: string) => requestHeaders.get(name) } })

  // Through the service, not through Prisma. This page counted rows directly since Phase 2 —
  // a non-negotiable 2 violation the lint rule could not see, because the import was dynamic.
  const counts = await dashboardCounts(actor, {})
  const { pendingManufacturers, catalogCategories, catalogProducts } = counts.ok
    ? counts.value
    : { pendingManufacturers: 0, catalogCategories: 0, catalogProducts: 0 }

  const queues: Tile[] = [
    { labelKey: 'pendingManufacturers', value: pendingManufacturers, href: '/yonetim/ureticiler' },
    { labelKey: 'pendingReviews', value: null },
    { labelKey: 'openComplaints', value: null },
    { labelKey: 'failedNotifications', value: null },
    { labelKey: 'infectedUploads', value: null },
    { labelKey: 'zeroResultDistricts', value: null },
  ]

  const health: Tile[] = [
    { labelKey: 'catalogCategories', value: catalogCategories, href: '/yonetim/katalog' },
    { labelKey: 'catalogProducts', value: catalogProducts, href: '/yonetim/katalog' },
  ]

  return (
    <AdminShell title={t('title')}>
      <p className="pb-md text-body-md text-muted">{t('subtitle')}</p>

      <section className="flex flex-col gap-md pb-lg">
        <h2 className="font-heading text-headline-md">{t('queues')}</h2>
        <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
          {queues.map((tile) => (
            <TileCard key={tile.labelKey} tile={tile} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-md">
        <h2 className="font-heading text-headline-md">{t('health')}</h2>
        <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
          {health.map((tile) => (
            <TileCard key={tile.labelKey} tile={tile} />
          ))}
        </div>
      </section>
    </AdminShell>
  )
}

async function TileCard({ tile }: { tile: Tile }) {
  const t = await getTranslations('admin.commandCenter')

  const body = (
    <Card density="dense" className="h-full">
      <CardHeader>
        <CardTitle className="text-body-md text-muted">{t(tile.labelKey)}</CardTitle>
      </CardHeader>
      <CardContent>
        {tile.value === null ? (
          <p className="text-body-sm text-muted">{t('notYet')}</p>
        ) : (
          <p className="font-heading text-display-lg">{tile.value}</p>
        )}
      </CardContent>
    </Card>
  )

  return tile.href === undefined ? body : <Link href={tile.href}>{body}</Link>
}
