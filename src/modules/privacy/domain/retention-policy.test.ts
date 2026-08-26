import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { LEGAL_HOLD_TABLES, SWEEP_RULES, SWEEP_TABLES } from './retention-policy'

/**
 * The structural guarantee of task 9.1: **the sweeper cannot touch legal-hold evidence**,
 * proven from the policy's own two halves — not from a comment, not from a review.
 */
describe('retention policy · legal hold is untouchable', () => {
  it('the sweep table set and the legal-hold set do not intersect — EMPTY, structurally', () => {
    const hold = new Set(Object.keys(LEGAL_HOLD_TABLES))
    const intersection = SWEEP_TABLES.filter((table) => hold.has(table))
    expect(intersection).toEqual([])
  })

  it('pins the legal-hold set — removing an entry is a decision with a lawyer in the room', () => {
    expect(Object.keys(LEGAL_HOLD_TABLES).sort()).toEqual(
      ['AuditLog', 'Consent', 'ContactDisclosure', 'Offer', 'OfferLine'].sort(),
    )
  })

  it('pins the sweep rules: table, action, and that anonymise never deletes', () => {
    expect(SWEEP_RULES.map((rule) => `${rule.table}:${rule.action}`)).toEqual([
      'Project:delete',
      'Notification:delete',
      'OfferRequest:anonymise',
      // 12.3: device addresses are personal data with their own clock (19 §Retention).
      'PushToken:delete',
      'RateLimitHit:delete',
    ])

    // The anonymise rule must name its fields and only free-text fields — the row lives.
    const anonymise = SWEEP_RULES.find((rule) => rule.action === 'anonymise')
    expect(Object.keys(anonymise?.anonymiseData ?? {})).toEqual(['declineReason', 'closedReason'])
  })

  it('every where-clause is bounded by a cutoff — no rule can match "everything"', () => {
    const now = new Date('2026-08-24T12:00:00Z')
    for (const rule of SWEEP_RULES) {
      const where = JSON.stringify(rule.where(now))
      expect(where, rule.rule).toMatch(/"lt":/)
    }
  })

  it('the sweeper executes the policy and nothing else — no table name outside the union', () => {
    // The job's switch is exhaustive over SweepRule['table']; this guards the source from
    // a hand-added prisma call on some other model sneaking in beside the loop.
    const source = readFileSync(
      join(process.cwd(), 'src/modules/privacy/infrastructure/retention-sweep-job.ts'),
      'utf8',
    )
    const models = [
      ...source.matchAll(/prisma\.([a-zA-Z]+)\.(?:deleteMany|updateMany|count|findMany)/g),
    ].map((match) => match[1])
    const allowed = new Set([
      'project',
      'notification',
      'offerRequest',
      'pushToken',
      'rateLimitHit',
      'file',
    ])
    for (const model of models) {
      expect(allowed.has(model!), `sweeper touches prisma.${model}`).toBe(true)
    }
    // `file` rides along ONLY under the Project rule (a draft's uploads leave with it) —
    // and File is not a legal-hold table.
    expect(Object.keys(LEGAL_HOLD_TABLES)).not.toContain('File')
  })
})
