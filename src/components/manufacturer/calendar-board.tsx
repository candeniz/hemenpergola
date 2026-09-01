import { getFormatter, getTranslations } from 'next-intl/server'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Link } from '@/i18n/navigation'
import {
  bucketByDay,
  CALENDAR_TIME_ZONE,
  monthGrid,
  shiftMonth,
  type CalendarEvent,
  type CalendarEventKind,
} from '@/modules/offer/domain/calendar'

/**
 * The manufacturer month board — task 14.1, `manufacturer_project_calendar`.
 *
 * **A Server Component with `<Link>` navigation, not a client calendar.** Month paging is a
 * URL, so the page is shareable, back works, and the grid renders with no JavaScript at all
 * — `07` §Rendering strategy's default, and there is no interaction here that needs state.
 *
 * **Not `components/ui/calendar.tsx`.** That one is `react-day-picker`, a date *input* for
 * the survey scheduler: it renders day buttons, and this needs day cells that hold event
 * chips. Same word, different component.
 *
 * **Below `lg` the grid is replaced by an agenda, not scrolled.** A seven-column month on a
 * phone is either unreadable or a horizontal scroll nobody discovers; the same events read
 * fine as a list. Both halves render from the same buckets, so they cannot disagree.
 *
 * The legend has three entries, not the design's four — `ADR-034`. Colours come from the
 * semantic status tokens rather than new ones: a deadline is a clock running against you
 * (`status-waiting`), a survey is work in flight (`status-progress`), an offer's validity is
 * neither (`status-neutral`).
 */

const KIND_CLASS: Record<CalendarEventKind, string> = {
  survey: 'bg-status-progress text-on-status-progress',
  request_deadline: 'bg-status-waiting text-on-status-waiting',
  offer_expiry: 'bg-status-neutral text-on-status-neutral',
}

const KINDS = ['survey', 'request_deadline', 'offer_expiry'] as const

/** Two chips, then a count. A cell that grows with its content breaks the grid's rhythm. */
const CHIPS_PER_CELL = 2

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/**
 * A `YYYY-MM-DD` key back to an instant for formatting. Noon UTC is the same calendar day
 * in `Europe/Istanbul` whatever the offset does, which midnight is not.
 */
const middayOf = (key: string): Date => new Date(`${key}T12:00:00.000Z`)

export async function CalendarBoard({
  companyId,
  year,
  month,
  events,
  todayKey,
}: {
  companyId: string
  year: number
  month: number
  events: readonly CalendarEvent[]
  /** `YYYY-MM-DD` in `CALENDAR_TIME_ZONE`, passed in so the component stays clock-free. */
  todayKey: string
}) {
  const [t, format] = await Promise.all([getTranslations('calendar'), getFormatter()])

  const grid = monthGrid(year, month)
  const buckets = bucketByDay(events)
  const previous = shiftMonth(year, month, -1)
  const next = shiftMonth(year, month, 1)

  const href = (target: { year: number; month: number }) =>
    `/panel/${companyId}/takvim?yil=${target.year}&ay=${target.month}`

  const monthLabel = format.dateTime(new Date(Date.UTC(year, month - 1, 15)), {
    timeZone: 'UTC', // A label for the month itself, not for an instant in it.
    year: 'numeric',
    month: 'long',
  })

  const stepClass =
    'inline-flex h-11 items-center rounded-sm border border-control-border px-sm text-label-md hover:bg-panel-hover'

  const upcoming = events.filter((event) => event.at >= `${todayKey}T00:00:00.000Z`).slice(0, 6)

  /**
   * An untitled project falls back to its kind, never to its id. A `cmt…` on screen is the
   * same defect as an untranslated message key.
   */
  const label = (event: CalendarEvent) => event.title ?? t(`kind.${event.kind}`)

  const chip = (event: CalendarEvent) => (
    <Link
      href={`/panel/${companyId}/talepler/${event.offerRequestId}`}
      className={`block truncate rounded-sm px-xs py-xs text-body-sm ${KIND_CLASS[event.kind]}`}
      title={`${t(`kind.${event.kind}`)} · ${label(event)}`}
    >
      {label(event)}
    </Link>
  )

  return (
    <div className="flex flex-col gap-base lg:flex-row lg:items-start">
      <Card className="min-w-0 flex-1">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-sm">
          <CardTitle>{monthLabel}</CardTitle>
          <nav aria-label={t('title')} className="flex items-center gap-xs">
            <Link href={href(previous)} aria-label={t('previousMonth')} className={stepClass}>
              <Icon name="chevron_left" dense />
            </Link>
            <Link href={`/panel/${companyId}/takvim`} className={stepClass}>
              {t('today')}
            </Link>
            <Link href={href(next)} aria-label={t('nextMonth')} className={stepClass}>
              <Icon name="chevron_right" dense />
            </Link>
          </nav>
        </CardHeader>

        <CardContent>
          {/* ── the grid, from lg up ─────────────────────────────────────── */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-7 border-b border-divider pb-xs">
              {WEEKDAYS.map((day) => (
                <div key={day} className="px-xs text-label-md uppercase text-muted">
                  {t(`weekday.${day}`)}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {grid.map((cell) => {
                const inCell = buckets.get(cell.key) ?? []
                const shown = inCell.slice(0, CHIPS_PER_CELL)
                const hidden = inCell.length - shown.length

                return (
                  <div
                    key={cell.key}
                    className={`min-h-24 min-w-0 border-b border-r border-divider p-xs ${
                      cell.inMonth ? '' : 'bg-panel-subtle'
                    }`}
                  >
                    <div className="mb-xs">
                      <span
                        className={
                          cell.key === todayKey
                            ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-action text-body-sm font-semibold text-on-action'
                            : `text-body-sm ${cell.inMonth ? 'text-on-panel' : 'text-muted'}`
                        }
                      >
                        {cell.day}
                      </span>
                    </div>

                    <ul className="flex flex-col gap-xs">
                      {shown.map((event) => (
                        <li key={event.id}>{chip(event)}</li>
                      ))}
                      {hidden > 0 ? (
                        <li className="px-xs text-body-sm text-muted">
                          {t('moreInDay', { count: hidden })}
                        </li>
                      ) : null}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── the agenda, below lg ─────────────────────────────────────── */}
          <ul className="flex flex-col gap-base lg:hidden">
            {grid
              .filter((cell) => (buckets.get(cell.key) ?? []).length > 0)
              .map((cell) => (
                <li key={cell.key}>
                  <p
                    className={`pb-xs text-label-md uppercase ${
                      cell.key === todayKey ? 'text-action' : 'text-muted'
                    }`}
                  >
                    {format.dateTime(middayOf(cell.key), {
                      timeZone: CALENDAR_TIME_ZONE,
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </p>
                  <ul className="flex flex-col gap-xs">
                    {(buckets.get(cell.key) ?? []).map((event) => (
                      <li key={event.id}>{chip(event)}</li>
                    ))}
                  </ul>
                </li>
              ))}
          </ul>

          {events.length === 0 ? (
            <p className="pt-base text-body-md text-muted">{t('empty')}</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex w-full shrink-0 flex-col gap-base lg:w-80">
        <Card>
          <CardHeader>
            <CardTitle>{t('upcoming')}</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-body-md text-muted">{t('upcomingEmpty')}</p>
            ) : (
              <ul className="flex flex-col gap-sm">
                {upcoming.map((event) => (
                  <li key={event.id} className="border-b border-divider pb-sm last:border-b-0">
                    <Link
                      href={`/panel/${companyId}/talepler/${event.offerRequestId}`}
                      className="text-body-md font-medium text-on-panel hover:underline"
                    >
                      {label(event)}
                    </Link>
                    <p className="text-body-sm text-muted">
                      {format.dateTime(new Date(event.at), {
                        // `Europe/Istanbul` for display, UTC in the database
                        // (`CLAUDE.md` §Conventions). Named here rather than left to the
                        // server's zone, which in a container is UTC.
                        timeZone: CALENDAR_TIME_ZONE,
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                      {event.detail === null ? '' : ` · ${event.detail}`}
                    </p>
                    <Badge className={`mt-xs ${KIND_CLASS[event.kind]}`}>
                      {t(`kind.${event.kind}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('legend')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-xs">
              {KINDS.map((kind) => (
                <li key={kind} className="flex items-center gap-sm text-body-md">
                  <span className={`h-2 w-2 rounded-full ${KIND_CLASS[kind]}`} aria-hidden />
                  {t(`kind.${kind}`)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
