/**
 * Delivery-log retention — `13` §Retention, task 7.1, recorded as **Q28** in
 * `25-progress.md` §Open questions.
 *
 * A dispatched notification row is a delivery log: its job (in-app history, proof of
 * sending) decays with time, and KVKK's storage-limitation principle (`19` §Retention)
 * says data outlives its purpose only by decision, not by default. The rule:
 * **dispatched rows older than 90 days are eligible for deletion** — except mandatory
 * events, whose rows are legs of a legal record and follow the disclosure's own retention
 * (`ADR-027`), not the log's.
 *
 * The SWEEP is deliberately not built here (Phase 9's ops slice, with the other cleanup
 * jobs — Q28 tracks it). What is built is the *rule*, as a where-clause a sweep job will
 * use verbatim, so the decision is code under test rather than a sentence in a log entry.
 */

import { MANDATORY_EVENTS } from './catalog'

export const NOTIFICATION_RETENTION_DAYS = 90

/**
 * The Prisma `where` selecting rows the sweep may delete: dispatched (never an
 * undelivered row — deleting one would silently cancel a send), older than the window,
 * and never a mandatory-event row.
 */
export function retentionWhere(now: Date): {
  dispatchedAt: { not: null; lt: Date }
  type: { notIn: string[] }
} {
  const cutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  return {
    dispatchedAt: { not: null, lt: cutoff },
    type: { notIn: [...MANDATORY_EVENTS] },
  }
}
