import { beforeAll, describe, expect, it } from 'vitest'

import { listNotifications } from '@/modules/notification/application/inbox-service'
import { ALL_NOTIFICATION_TYPES } from '@/modules/notification/domain/catalog'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'

import { getPrisma } from './setup'

/**
 * **The inbox under a renamed event** — task 14.8.
 *
 * `listNotifications` took the newest fifty rows and *then* dropped the ones the catalogue
 * no longer knows. Nothing about that is visible while every row is known, which is why the
 * method shipped in 12.2 with no test at all. It stops being invisible the day an event is
 * renamed: templates live in the repository rather than the database (`13`), so a rename is
 * a pure code change with no migration for rows already written, and `ADR-027` keeps
 * mandatory events out of the ninety-day sweep — the old rows stay, indefinitely, at the top
 * of the list where they are newest.
 *
 * Then the quota goes to rows that are discarded a line later. Twelve renamed rows cost the
 * reader twelve real ones; fifty cost them the whole screen, and the inbox reads "empty"
 * while readable notifications sit directly underneath.
 *
 * The fix is to filter in the query. The subject loses nothing by their absence here: the
 * same rows are in the KVKK export, with their type and their dates, and 14.7's entry in
 * `19` §Export says why they must be. `13` §Inbox now says why these two answers differ.
 */

const KNOWN = 'offer_request_received'
const RENAMED = 'offer_request_received_renamed_in_a_later_phase'

let userId = ''

const actor = (): ActorContext =>
  anonymousActor({ userId, globalRole: 'CUSTOMER', ip: '203.0.113.91' })

/** `base` counts backwards from a fixed instant, so "newest" is deterministic. */
const at = (minutesAgo: number) => new Date(Date.UTC(2026, 8, 1, 12) - minutesAgo * 60_000)

beforeAll(async () => {
  const prisma = getPrisma()
  const user = await prisma.user.create({
    data: { email: 'inbox-quota@example.com', fullName: 'Gelen Kutusu' },
  })
  userId = user.id

  /*
   * Sixty known rows, and twelve renamed ones that are all NEWER than every one of them.
   * That ordering is the whole fixture: a renamed row buried at position 400 costs nothing,
   * and the realistic case is the opposite — the rename happens now, so its orphans are the
   * most recent things the user has.
   */
  await prisma.notification.createMany({
    data: [
      ...Array.from({ length: 60 }, (_, index) => ({
        userId: user.id,
        type: KNOWN,
        payload: { companyCount: index + 1 },
        createdAt: at(100 + index),
      })),
      ...Array.from({ length: 12 }, (_, index) => ({
        userId: user.id,
        type: RENAMED,
        payload: { companyCount: 1 },
        createdAt: at(index),
      })),
    ],
  })
}, 120_000)

describe('14.8 · the inbox survives a renamed event', () => {
  it('never shows a type the catalogue cannot name', async () => {
    const result = await listNotifications(actor(), {})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Both surfaces render `privacy.events.${type}`; an unknown type there is a raw message
    // key on screen, and on mobile a row whose tap cannot resolve a destination.
    expect(result.value.notifications.map((row) => row.type)).not.toContain(RENAMED)
    expect(
      result.value.notifications.every((row) =>
        (ALL_NOTIFICATION_TYPES as string[]).includes(row.type),
      ),
    ).toBe(true)
  })

  it('gives the reader fifty readable rows, not fifty minus the unreadable ones', async () => {
    const result = await listNotifications(actor(), {})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(
      result.value.notifications,
      'the twelve renamed rows are newest, so a take-then-filter loses twelve real ones',
    ).toHaveLength(50)
  })

  it('stays newest-first among the rows it does return', async () => {
    const result = await listNotifications(actor(), {})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const times = result.value.notifications.map((row) => row.createdAt.getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('a full page of renamed rows does not empty the inbox', async () => {
    const prisma = getPrisma()
    const other = await prisma.user.create({
      data: { email: 'inbox-all-renamed@example.com', fullName: 'Tamamı Yeniden Adlandırılmış' },
    })

    // Fifty renamed rows on top of ten readable ones — the worst case, and the one that
    // turns "your inbox is empty" into a lie the user cannot see past.
    await prisma.notification.createMany({
      data: [
        ...Array.from({ length: 10 }, (_, index) => ({
          userId: other.id,
          type: KNOWN,
          payload: {},
          createdAt: at(100 + index),
        })),
        ...Array.from({ length: 50 }, (_, index) => ({
          userId: other.id,
          type: RENAMED,
          payload: {},
          createdAt: at(index),
        })),
      ],
    })

    const result = await listNotifications(
      anonymousActor({ userId: other.id, globalRole: 'CUSTOMER', ip: '203.0.113.92' }),
      {},
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.notifications).toHaveLength(10)
  })
})
