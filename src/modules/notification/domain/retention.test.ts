import { describe, expect, it } from 'vitest'

import { MANDATORY_EVENTS } from './catalog'
import { NOTIFICATION_RETENTION_DAYS, retentionWhere } from './retention'

describe('notification retention rule (Q28)', () => {
  it('is 90 days, pinned — changing the window is a documented decision, not a drive-by', () => {
    expect(NOTIFICATION_RETENTION_DAYS).toBe(90)
  })

  it('selects only dispatched rows older than the window and spares mandatory events', () => {
    const now = new Date('2026-08-24T12:00:00Z')
    const where = retentionWhere(now)

    expect(where.dispatchedAt.not).toBeNull()
    expect(where.dispatchedAt.lt).toEqual(new Date('2026-05-26T12:00:00Z'))
    expect(where.type.notIn).toEqual([...MANDATORY_EVENTS])
    expect(where.type.notIn).toContain('contact_disclosed')
  })
})
