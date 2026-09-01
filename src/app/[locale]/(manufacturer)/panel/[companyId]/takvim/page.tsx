import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { CalendarBoard } from '@/components/manufacturer/calendar-board'
import { PortalShell } from '@/components/layouts/portal-shell'

export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * `manufacturer_project_calendar` — task 14.1.
 *
 * The nav has linked here since Phase 3 (`nav-items.ts`) and the route 404'd, which is the
 * failure that file's own comment warns about: *"a link to a 404 advertises a page the same
 * way a disabled link advertises a feature."*
 *
 * The month lives in the query string (`?yil=&ay=`), so paging is a link rather than client
 * state — shareable, back-navigable, and rendered without JavaScript. A garbled value is
 * dropped rather than rejected, and the service falls back to the current month: a calendar
 * is a place you land, not a form you submit.
 *
 * **The month the board renders is the one the service returns**, not the one asked for.
 * Resolving "now" needs `Europe/Istanbul`, and `app/` may not import the domain module that
 * knows it (`CLAUDE.md` non-negotiable 2).
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ locale, companyId }, query] = await Promise.all([params, searchParams])
  setRequestLocale(locale)

  const [t, { listCalendar, listCalendarSchema }, { resolveActor }] = await Promise.all([
    getTranslations('calendar'),
    import('@/modules/offer/application/appointment-service'),
    import('@/shared/context/actor'),
  ])

  const asked = listCalendarSchema.safeParse({
    ...(typeof query.yil === 'string' ? { year: query.yil } : {}),
    ...(typeof query.ay === 'string' ? { month: query.ay } : {}),
  })

  const { headers } = await import('next/headers')
  const requestHeaders = await headers()
  const actor = await resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    { companyId },
  )

  const result = await listCalendar(actor, asked.success ? asked.data : {})

  return (
    <PortalShell title={t('title')} companyId={companyId}>
      <p className="pb-base text-body-md text-muted">{t('subtitle')}</p>
      {result.ok ? (
        <CalendarBoard
          companyId={companyId}
          year={result.value.year}
          month={result.value.month}
          events={result.value.events}
          todayKey={result.value.todayKey}
        />
      ) : (
        <p className="text-body-md text-muted">{t('empty')}</p>
      )}
    </PortalShell>
  )
}
