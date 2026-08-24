/**
 * THE retention policy — `19` §Retention as code, task 9.1, and the most dangerous file
 * of the phase for an inverted reason: the sweeper deletes irreversibly, and several of
 * `19`'s rows are **evidence kept under legal obligation**. A wrong where-clause here is
 * not data loss; it is evidence loss.
 *
 * So the policy is one closed structure with two disjoint halves, and a unit test asserts
 * the intersection of the sweeper's table set with the legal-hold set is EMPTY — the
 * guarantee is structural, not a comment:
 *
 *   **LEGAL_HOLD** — tables the sweeper must never touch, with the obligation that holds
 *   them. `Consent` and `ContactDisclosure` ARE the evidence of lawful disclosure (10y);
 *   won engagements and offers are commercial/tax records (10y); the audit log is 2 years
 *   hot and then a cold ARCHIVE — an archive mechanism V1 does not have, so the sweeper
 *   stays out entirely rather than deleting what should have been archived.
 *
 *   **SWEEP_RULES** — what the sweeper may act on, each rule carrying its own
 *   where-clause builder and an action that is either `delete` or `anonymise` (`19`:
 *   closed/lost requests are anonymised after 3 years, never deleted — the row and its
 *   ids stay, the free-text fields that could carry personal context go).
 *
 * Q25 (anonymous drafts, 30 days) and Q28 (notification delivery log, 90 days) close with
 * this file: their rules move from "written and tested, nothing runs them" to "run by
 * `audit.retention_sweep`".
 */

import { expiredAnonymousDraftsWhere } from '@/shared/context/anonymous-key'

import { retentionWhere as notificationRetentionWhere } from '@/modules/notification/domain/retention'

/** Tables the sweeper must NEVER touch, with the obligation. Closed and pinned by test. */
export const LEGAL_HOLD_TABLES = {
  Consent: '10y — the evidence of lawful processing (19 §Retention)',
  ContactDisclosure: '10y — the evidence of lawful disclosure (19 §Retention)',
  Offer: '10y — commercial/tax record (19 §Retention)',
  OfferLine: '10y — commercial/tax record, part of the offer',
  AuditLog: '2y hot then COLD ARCHIVE — V1 has no archive, so no deletion either',
} as const

export type SweepRule = {
  /** The Prisma model the rule acts on — the sweeper derives its table set from here. */
  table: 'Project' | 'Notification' | 'OfferRequest' | 'RateLimitHit'
  rule: string
  action: 'delete' | 'anonymise'
  /** The where-clause, built at sweep time. */
  where: (now: Date) => Record<string, unknown>
  /** For `anonymise`: the fields nulled. The row and its ids survive. */
  anonymiseData?: Record<string, null>
}

const THREE_YEARS_MS = 3 * 365 * 24 * 60 * 60 * 1000

export const SWEEP_RULES: readonly SweepRule[] = [
  {
    table: 'Project',
    rule: 'Q25 · anonymous drafts, 30 days from last touch (19 §Retention)',
    action: 'delete',
    where: (now) => expiredAnonymousDraftsWhere(now),
  },
  {
    table: 'Notification',
    rule: 'Q28 · dispatched delivery log, 90 days; mandatory events excluded (ADR-027)',
    action: 'delete',
    where: (now) => notificationRetentionWhere(now),
  },
  {
    table: 'OfferRequest',
    rule: 'closed/lost requests · 3 years, then ANONYMISED — never deleted (19 §Retention)',
    action: 'anonymise',
    where: (now) => ({
      status: { in: ['DECLINED', 'EXPIRED', 'CANCELLED', 'LOST'] },
      updatedAt: { lt: new Date(now.getTime() - THREE_YEARS_MS) },
      // Idempotence: only rows that still carry the free text.
      OR: [{ declineReason: { not: null } }, { closedReason: { not: null } }],
    }),
    // The row, its ids and its status history stay — the manufacturer's commercial
    // record survives. What goes is the free text that can carry personal context.
    anonymiseData: { declineReason: null, closedReason: null },
  },
  {
    table: 'RateLimitHit',
    rule: 'access-log family · 12 months (19 §Retention "access logs")',
    action: 'delete',
    where: (now) => ({ windowStart: { lt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) } }),
  },
]

export const SWEEP_TABLES: readonly string[] = SWEEP_RULES.map((rule) => rule.table)
