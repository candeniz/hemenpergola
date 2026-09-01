import { describe, expect, it } from 'vitest'

import {
  bucketByDay,
  dayKey,
  gridRange,
  monthGrid,
  shiftMonth,
  zonedInstant,
  type CalendarEvent,
} from './calendar'

/**
 * Task 14.1. The calendar's arithmetic, tested where it is pure — no database, no clock.
 *
 * The property that matters is the one a formatted timestamp never exercises: **which
 * Istanbul day an instant falls on**. An appointment at 00:30 local is the previous day in
 * UTC, so a grid built from UTC parts files it one cell early, and the manufacturer sees a
 * survey on the wrong date. Everything else here is grid shape.
 */

const event = (id: string, at: string): CalendarEvent => ({
  id,
  kind: 'survey',
  at,
  offerRequestId: 'ofr_1',
  title: id,
  detail: null,
})

describe('14.1 · calendar arithmetic', () => {
  describe('dayKey — the Istanbul day, not the UTC one', () => {
    it('files an instant after local midnight on the local day', () => {
      // 2026-09-01T21:30Z is 2026-09-02 00:30 in Istanbul (+03). The UTC day is the 1st.
      expect(dayKey(new Date('2026-09-01T21:30:00Z'))).toBe('2026-09-02')
    })

    it('files an instant before local midnight on the previous day', () => {
      expect(dayKey(new Date('2026-09-01T20:59:00Z'))).toBe('2026-09-01')
    })

    it('agrees with itself across the whole day', () => {
      const keys = new Set<string>()
      for (let hour = 0; hour < 24; hour += 1) {
        keys.add(dayKey(new Date(Date.UTC(2026, 8, 10, hour))))
      }
      // 24 UTC hours of one date span exactly two Istanbul days.
      expect([...keys].sort()).toEqual(['2026-09-10', '2026-09-11'])
    })
  })

  describe('zonedInstant — a wall clock back to UTC', () => {
    it('round-trips through dayKey', () => {
      for (const [y, m, d] of [
        [2026, 1, 1],
        [2026, 6, 15],
        [2026, 12, 31],
      ] as const) {
        const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        expect(dayKey(zonedInstant(y, m, d))).toBe(key)
        // Still the same local day one minute before it ends.
        expect(dayKey(zonedInstant(y, m, d, 23, 59))).toBe(key)
      }
    })

    it('midnight local is not midnight UTC', () => {
      // The whole point of the helper: +03 means local midnight is 21:00 the day before.
      expect(zonedInstant(2026, 9, 2).toISOString()).toBe('2026-09-01T21:00:00.000Z')
    })
  })

  describe('monthGrid', () => {
    it('is always 42 cells, so the grid never changes height', () => {
      for (let month = 1; month <= 12; month += 1) {
        expect(monthGrid(2026, month), `month ${month}`).toHaveLength(42)
      }
      // February 2027 starts on a Monday and has 28 days — the degenerate case.
      expect(monthGrid(2027, 2)).toHaveLength(42)
    })

    it('starts on Monday', () => {
      // 1 September 2026 is a Tuesday, so the grid opens on Monday 31 August.
      const grid = monthGrid(2026, 9)
      expect(grid[0]).toEqual({ key: '2026-08-31', day: 31, inMonth: false })
      expect(grid[1]).toEqual({ key: '2026-09-01', day: 1, inMonth: true })
    })

    it('marks only its own days as inMonth, and counts them', () => {
      const grid = monthGrid(2026, 9)
      expect(grid.filter((cell) => cell.inMonth)).toHaveLength(30)
      expect(grid.filter((cell) => !cell.inMonth).length).toBe(12)
    })

    it('keys are contiguous calendar days', () => {
      const grid = monthGrid(2026, 3)
      for (let index = 1; index < grid.length; index += 1) {
        const previous = new Date(`${grid[index - 1]?.key}T12:00:00Z`).getTime()
        const current = new Date(`${grid[index]?.key}T12:00:00Z`).getTime()
        expect(current - previous).toBe(86_400_000)
      }
    })
  })

  describe('gridRange', () => {
    it('covers every cell the grid renders, exclusive at the end', () => {
      const grid = monthGrid(2026, 9)
      const { from, to } = gridRange(2026, 9)

      expect(dayKey(from)).toBe(grid[0]?.key)
      // `to` is the instant the last day ends, so it belongs to the following day.
      expect(dayKey(new Date(to.getTime() - 1))).toBe(grid[41]?.key)
    })

    it('an event in a borrowed leading cell is inside the range', () => {
      const { from, to } = gridRange(2026, 9)
      const inLeadingCell = zonedInstant(2026, 8, 31, 9, 0)
      expect(inLeadingCell >= from && inLeadingCell < to).toBe(true)
    })
  })

  describe('bucketByDay', () => {
    it('groups by Istanbul day and sorts within the day', () => {
      const buckets = bucketByDay([
        event('late', '2026-09-02T14:00:00Z'),
        event('early', '2026-09-02T06:00:00Z'),
        event('midnight-local', '2026-09-01T21:30:00Z'),
      ])

      expect(buckets.get('2026-09-02')?.map((e) => e.id)).toEqual([
        'midnight-local',
        'early',
        'late',
      ])
      expect(buckets.get('2026-09-01')).toBeUndefined()
    })
  })

  describe('shiftMonth', () => {
    it('crosses the year boundary in both directions', () => {
      expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
      expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
      expect(shiftMonth(2026, 6, 1)).toEqual({ year: 2026, month: 7 })
    })
  })
})
