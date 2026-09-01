/**
 * The manufacturer calendar's arithmetic — task 14.1, the `manufacturer_project_calendar`
 * design that task 6.7 already named as this module's screen.
 *
 * Pure by construction: no Prisma, no `new Date()` without an argument, no locale. What
 * lives here is the part with a right answer — which UTC instant falls on which Istanbul
 * day, and which 42 cells a month grid has — so it can be tested without a database and
 * without a clock.
 *
 * ## Why the time zone is computed rather than written down
 *
 * `CLAUDE.md` §Conventions: UTC in the database, `Europe/Istanbul` for display. A calendar
 * makes that rule load-bearing in a way a formatted timestamp does not — an appointment at
 * 00:30 Istanbul is the *previous* day in UTC, so a grid built from UTC parts puts it in the
 * wrong cell and nobody notices until a manufacturer misses a survey.
 *
 * The offset is derived from `Intl` per instant instead of the `+03` Turkey has used since
 * 2016. That literal would be correct today and silently wrong the next time the country
 * changes its clock policy — which it has done twice in a decade — and the failure would be
 * a calendar that is off by an hour for half the year, which reads as a bug in the data.
 */

export const CALENDAR_TIME_ZONE = 'Europe/Istanbul'

/**
 * What a manufacturer's calendar can show, and **nothing else**.
 *
 * The Stitch screen legends four kinds — deadlines, meetings, surveys, general/follow-up.
 * Three of them have a domain behind them; "meetings" and "general/follow-up" do not, and
 * `CLAUDE.md` §Do not build these is explicit that a design existing is not a decision to
 * build it. Inventing an ad-hoc events table to fill a legend would be the tail wagging the
 * dog. Recorded as `ADR-034`.
 *
 *   `survey`           an `Appointment` — the site visit, `11` §Survey
 *   `request_deadline` `OfferRequest.slaExpiresAt` while PENDING — the clock the
 *                      manufacturer is answering against
 *   `offer_expiry`     `Offer.validUntil` while SENT — the customer's clock, which the
 *                      manufacturer wants to see coming
 */
export type CalendarEventKind = 'survey' | 'request_deadline' | 'offer_expiry'

export type CalendarEvent = {
  id: string
  kind: CalendarEventKind
  /** The instant, ISO-8601 UTC. Formatting is the component's job, with the locale. */
  at: string
  offerRequestId: string
  /**
   * What the row is about — the project's own title, or an offer number. **Never the
   * customer's name**: `ADR-006` and `19` §Disclosure gate contact data on acceptance, and a
   * calendar is not a disclosure surface.
   *
   * `null` when there is nothing human to show — a project the customer never named. The
   * component then labels the chip by its kind, because a raw `cmt…` id on screen is the
   * same defect as an untranslated message key: technically accurate, useless to read.
   */
  title: string | null
  /** A second line: the city, or the offer's status. Nullable, never personal. */
  detail: string | null
}

export type DayCell = {
  /** `YYYY-MM-DD` in `CALENDAR_TIME_ZONE` — the key events are bucketed by. */
  key: string
  /** Day of the month, 1–31. */
  day: number
  /** False for the leading and trailing cells borrowed from the neighbouring months. */
  inMonth: boolean
}

const PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: CALENDAR_TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

type Parts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function zonedParts(instant: Date): Parts {
  const found: Record<string, number> = {}
  for (const part of PARTS.formatToParts(instant)) {
    if (part.type !== 'literal') found[part.type] = Number(part.value)
  }
  return {
    year: found.year as number,
    month: found.month as number,
    day: found.day as number,
    // `hour12: false` renders midnight as 24 in some ICU versions; normalise it.
    hour: (found.hour as number) % 24,
    minute: found.minute as number,
    second: found.second as number,
  }
}

/** The zone's offset from UTC at this instant, in milliseconds. */
function offsetMs(instant: Date): number {
  const p = zonedParts(instant)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant.getTime()
}

/**
 * The UTC instant of a wall-clock time in `CALENDAR_TIME_ZONE`.
 *
 * Two passes, and the second is not decoration: the offset has to be read *at the answer*,
 * not at the guess, or an instant within an hour of a transition lands on the wrong side of
 * it. Turkey has no DST today, which is exactly why a single-pass version would pass every
 * test and wait.
 */
export function zonedInstant(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute)
  const guess = new Date(naive - offsetMs(new Date(naive)))
  return new Date(naive - offsetMs(guess))
}

/** `YYYY-MM-DD` for an instant, in `CALENDAR_TIME_ZONE`. The bucket key for the grid. */
export function dayKey(instant: Date): string {
  const p = zonedParts(instant)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/**
 * The six-week grid for one month, **Monday first** — `tr-TR` and the Stitch screen's own
 * `SUN`-first header disagree, and the locale wins: a Turkish week starts on Monday, and a
 * calendar that starts on Sunday is read wrong at a glance rather than misread carefully.
 *
 * Always 42 cells. A variable row count makes the grid jump height between months, which is
 * the kind of thing that looks like a rendering bug.
 */
export function monthGrid(year: number, month: number): DayCell[] {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1))
  // getUTCDay(): 0 = Sunday. Monday-first index: Monday → 0, Sunday → 6.
  const lead = (firstOfMonth.getUTCDay() + 6) % 7

  const cells: DayCell[] = []
  for (let index = 0; index < 42; index += 1) {
    const cursor = new Date(Date.UTC(year, month - 1, 1 + index - lead))
    cells.push({
      key: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(
        cursor.getUTCDate(),
      ).padStart(2, '0')}`,
      day: cursor.getUTCDate(),
      inMonth: cursor.getUTCMonth() === month - 1 && cursor.getUTCFullYear() === year,
    })
  }
  return cells
}

/**
 * The UTC window the grid covers — what the service queries with.
 *
 * Bounded by the grid rather than the month, because the leading and trailing cells are
 * rendered and an event in one of them must appear. `to` is exclusive.
 */
export function gridRange(year: number, month: number): { from: Date; to: Date } {
  const cells = monthGrid(year, month)
  const first = cells[0] as DayCell
  const last = cells[cells.length - 1] as DayCell

  const parse = (key: string): [number, number, number] => {
    const [y, m, d] = key.split('-').map(Number)
    return [y as number, m as number, d as number]
  }

  const [fy, fm, fd] = parse(first.key)
  const [ly, lm, ld] = parse(last.key)

  return { from: zonedInstant(fy, fm, fd), to: zonedInstant(ly, lm, ld + 1) }
}

/** Group events by their Istanbul day, so the grid can render a cell in one lookup. */
export function bucketByDay(events: readonly CalendarEvent[]): Map<string, CalendarEvent[]> {
  const buckets = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    const key = dayKey(new Date(event.at))
    const bucket = buckets.get(key)
    if (bucket === undefined) buckets.set(key, [event])
    else bucket.push(event)
  }
  for (const bucket of buckets.values()) bucket.sort((a, b) => a.at.localeCompare(b.at))
  return buckets
}

/** The step to the previous or next month, without a Date in the caller. */
export function shiftMonth(
  year: number,
  month: number,
  by: -1 | 1,
): { year: number; month: number } {
  const zeroBased = month - 1 + by
  return { year: year + Math.floor(zeroBased / 12), month: (((zeroBased % 12) + 12) % 12) + 1 }
}
