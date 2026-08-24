import 'server-only'

import { PgBoss } from 'pg-boss'

import { env } from '@/shared/config/env'

/**
 * Background work — `05-system-architecture.md` §Background work, `23` §Runtime.
 *
 * pg-boss on the same Postgres. No Redis and no separate broker in V1: one fewer thing to
 * run, one fewer thing to back up, and the queue is transactional with the data it is about.
 *
 * ## Two processes, one image
 *
 * `23` §Runtime: `web → next start` and `worker → node dist/worker.js` from the **same
 * image**. This module is the shared half — the queue names, the payload types, and the
 * client. The web side only ever *sends*; `src/worker.ts` is the only thing that registers
 * handlers.
 *
 * ## Idempotency is not optional
 *
 * `23` §Runtime says jobs are idempotent, and it is not a style preference: a worker being
 * replaced is drained, in-flight jobs are retried on the new instance, and a job that ran
 * halfway before the old process went away runs again from the start. Every handler here
 * therefore has to be safe to run twice on the same payload and produce the same result —
 * asserted by `jobs.integration.test.ts` rather than assumed.
 */

/** The six jobs of `05` §Background work. Two are implemented in Phase 3. */
export const JOB = {
  /** Fills `ServiceArea.centerPoint` for a `RADIUS` area. Phase 3. */
  geocodeServiceArea: 'geo.geocode_service_area',
  /** Variants, dimensions, virus-scan status. Phase 3. */
  mediaProcess: 'media.process',
  /** Phase 6. */
  slaExpire: 'offer_request.sla_expire',
  /** Phase 7. */
  notificationDispatch: 'notification.dispatch',
  /**
   * Phase 7 · task 7.3 — recomputes `Company`'s denormalised aggregates from source
   * (`16` §Aggregates). Added to `05` §Background work in the same change.
   */
  analyticsRefresh: 'company.analytics_refresh',
  /** Phase 8. */
  searchReindexCompany: 'search.reindex_company',
  /** Phase 9. */
  auditRetentionSweep: 'audit.retention_sweep',
  /**
   * NEVER created, on purpose — the permanent trigger for the loud-enqueue-failure test.
   * The test originally sent to `search.reindex_company`, which Phase 8 creates: the day
   * that queue exists, the test would silently prove nothing (`28` §11: "a stub for a
   * table that is coming is a landmine with a date on it"). This name is its own
   * documentation; adding it to `ensureQueues`/`WORKED_QUEUES` defeats a test.
   */
  neverCreatedProbe: 'probe.queue_that_must_never_exist',
} as const

export type JobName = (typeof JOB)[keyof typeof JOB]

export type JobPayloads = {
  [JOB.geocodeServiceArea]: { serviceAreaId: string }
  [JOB.mediaProcess]: { fileId: string }
  [JOB.slaExpire]: {
    offerRequestId: string
    /** One queue, three moments — `11` §SLA: reminders at 50% and 90%, then expiry. */
    kind: 'reminder_50' | 'reminder_90' | 'expire'
  }
  [JOB.notificationDispatch]: { notificationId: string }
  [JOB.analyticsRefresh]: { companyId: string }
  [JOB.searchReindexCompany]: { companyId: string }
  [JOB.neverCreatedProbe]: Record<string, never>
  [JOB.auditRetentionSweep]: Record<string, never>
}

/**
 * One boss per process, parked on `globalThis` for the same reason the Prisma client is:
 * Next replaces modules on every edit in development, and a second boss means a second
 * connection pool and duplicated maintenance work against the same tables.
 */
const globalForBoss = globalThis as unknown as { pgBoss?: PgBoss; pgBossStarted?: Promise<void> }

function createBoss(): PgBoss {
  return new PgBoss({
    connectionString: env.DIRECT_URL,
    /*
     * A schema of its own. pg-boss creates and migrates its own tables, and `ADR-014`'s
     * "one migration per phase" is about *our* schema — letting it into `public` would put
     * a dozen tables into `migration-1.integration.test.ts`'s exact table list and make
     * every pg-boss upgrade a change to our migration history.
     */
    schema: 'pgboss',
    // The web tier only sends. Maintenance and monitoring belong to the worker, which is
    // the process that is allowed to be stateful about the queue.
    supervise: false,
  })
}

export function getBoss(): PgBoss {
  globalForBoss.pgBoss ??= createBoss()
  return globalForBoss.pgBoss
}

/** Start once per process, and only once even if two callers race. */
export async function startBoss(): Promise<PgBoss> {
  const boss = getBoss()
  globalForBoss.pgBossStarted ??= boss.start().then(() => undefined)
  await globalForBoss.pgBossStarted
  return boss
}

/**
 * Create the queues this build works.
 *
 * Shared rather than done in `worker.ts`, because the *policy* is what makes `singletonKey`
 * mean anything and a queue created without it silently accepts duplicates. pg-boss's
 * `stately` policy allows one job per `(queue, singletonKey)` in each state, which is
 * exactly "one pending geocode per area however many times it is saved".
 *
 * Idempotent by construction: `createQueue` on an existing queue is a no-op, so the worker
 * calling it on every boot is correct.
 *
 * **Every queue a handler works must be here.** Found the hard way in 7.1: `enqueue()`
 * never throws (by design, see below), so a `send` to a queue nobody created fails
 * *silently* — Phase 6 shipped `offer_request.sla_expire` with handler, singleton keys and
 * tests, and every production-path enqueue of it was dropped on the floor because this
 * list still ended at `media.process`. The worker smoke test now cross-checks this list
 * against the handlers `worker.ts` registers.
 */
export const WORKED_QUEUES = [
  JOB.geocodeServiceArea,
  JOB.mediaProcess,
  JOB.slaExpire,
  JOB.notificationDispatch,
  JOB.analyticsRefresh,
] as const

export async function ensureQueues(): Promise<void> {
  const boss = await startBoss()
  for (const name of WORKED_QUEUES) {
    await boss.createQueue(name, { policy: 'stately' })
  }
}

export type EnqueueOptions = {
  /**
   * A stable key for this unit of work. pg-boss deduplicates on it while a job with the
   * same key is queued, which is the cheap half of idempotency: re-saving a service area
   * five times enqueues one geocode, not five.
   *
   * The expensive half is the handler being safe to run twice anyway, because a *completed*
   * job no longer blocks a new one with the same key.
   */
  singletonKey?: string
  /** Seconds to wait before the job becomes visible. */
  startAfterSeconds?: number
}

/**
 * A failed enqueue must never be *silent* — the lesson of the Phase 6 SLA drop, where
 * every failure was logged to a stdout nobody read and nothing else recorded it. Failures
 * land here (bounded ring buffer) and `/api/health` reports any failure in the last
 * window as `degraded`, so the class of bug becomes a red deploy gate instead of a
 * quiet log line.
 */
export type EnqueueFailure = { queue: string; at: Date; message: string }

const ENQUEUE_FAILURE_BUFFER = 100
export const ENQUEUE_FAILURE_WINDOW_MS = 15 * 60 * 1000

const globalForFailures = globalThis as unknown as { enqueueFailures?: EnqueueFailure[] }

function failureLog(): EnqueueFailure[] {
  globalForFailures.enqueueFailures ??= []
  return globalForFailures.enqueueFailures
}

export function recentEnqueueFailures(
  windowMs: number = ENQUEUE_FAILURE_WINDOW_MS,
): readonly EnqueueFailure[] {
  const cutoff = Date.now() - windowMs
  return failureLog().filter((failure) => failure.at.getTime() >= cutoff)
}

/**
 * Send a job.
 *
 * **Never throws** — but never silently either; see `recentEnqueueFailures`. A failed
 * enqueue must not roll back the write that triggered it: a service area that saved but
 * did not geocode is a service area with no centre, which the screen already renders as
 * "hesaplanıyor" and a re-save fixes. A service area that failed to save because the
 * queue was down is a manufacturer who lost their work.
 */
export async function enqueue<T extends JobName>(
  name: T,
  payload: JobPayloads[T],
  options: EnqueueOptions = {},
): Promise<string | null> {
  try {
    const boss = await startBoss()
    return await boss.send(name, payload, {
      ...(options.singletonKey === undefined ? {} : { singletonKey: options.singletonKey }),
      ...(options.startAfterSeconds === undefined ? {} : { startAfter: options.startAfterSeconds }),
      retryLimit: 5,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 15 * 60,
    })
  } catch (error) {
    console.error('[jobs] enqueue failed', name, error)
    const log = failureLog()
    log.push({
      queue: name,
      at: new Date(),
      message: error instanceof Error ? error.message : String(error),
    })
    if (log.length > ENQUEUE_FAILURE_BUFFER) log.splice(0, log.length - ENQUEUE_FAILURE_BUFFER)
    return null
  }
}

/** Tests and the worker's own shutdown path. */
export async function stopBoss(): Promise<void> {
  const boss = globalForBoss.pgBoss
  if (boss === undefined) return

  await boss.stop({ graceful: true })
  globalForBoss.pgBoss = undefined
  globalForBoss.pgBossStarted = undefined
}
