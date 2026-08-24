import 'server-only'

import { env } from '@/shared/config/env'
import { prisma } from '@/shared/db'
import { recentEnqueueFailures } from '@/shared/jobs'

/**
 * The health check behind `/api/health` (`23-deployment-and-environments.md` §Pipeline).
 *
 * Three real checks, not three optimistic ones:
 *
 *   database   a query that actually round-trips to Postgres
 *   migrations the latest applied row in `_prisma_migrations`, so a container running
 *              against a database that has not been migrated reports unhealthy rather than
 *              serving traffic and failing per-request
 *   storage    a HEAD against the S3 endpoint
 *
 * Each check is timed and bounded. A health endpoint that can hang is a health endpoint
 * that turns one sick dependency into a stalled rolling deploy.
 */

const TIMEOUT_MS = 3_000

export type CheckResult = {
  ok: boolean
  durationMs: number
  detail?: string
}

export type HealthReport = {
  status: 'ok' | 'degraded'
  checkedAt: string
  environment: string
  checks: {
    database: CheckResult
    migrations: CheckResult & { version?: string }
    storage: CheckResult
    /**
     * Enqueue failures in the last window. Not a probe — a report: `enqueue()` never
     * throws by design, and the Phase 6 SLA drop proved a logged-and-ignored failure is
     * a silent one. Any recent failure turns the report `degraded`.
     */
    queue: CheckResult
  }
}

async function withTimeout<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)),
      TIMEOUT_MS,
    )
  })

  try {
    return await Promise.race([operation, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<CheckResult & { value?: T }> {
  const started = Date.now()

  try {
    const value = await withTimeout(fn(), label)
    return { ok: true, durationMs: Date.now() - started, value }
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - started,
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

async function checkDatabase(): Promise<CheckResult> {
  const { value: _value, ...result } = await timed('database', async () => {
    await prisma.$queryRaw`SELECT 1`
  })
  return result
}

async function checkMigrations(): Promise<CheckResult & { version?: string }> {
  const { value, ...result } = await timed('migrations', async () => {
    const rows = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
      SELECT migration_name, finished_at
      FROM _prisma_migrations
      WHERE finished_at IS NOT NULL
      ORDER BY finished_at DESC
      LIMIT 1
    `

    const latest = rows[0]
    if (latest === undefined) {
      throw new Error('no applied migration found — the database has not been migrated')
    }
    return latest.migration_name
  })

  return value === undefined ? result : { ...result, version: value }
}

async function checkStorage(): Promise<CheckResult> {
  const { value: _value, ...result } = await timed('storage', async () => {
    const response = await fetch(`${env.S3_ENDPOINT}/${env.S3_BUCKET}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    // 200 or 403 both prove the endpoint is reachable and the bucket exists; an anonymous
    // HEAD on a private bucket is *supposed* to be refused. 404 means it is not there.
    if (response.status === 404) {
      throw new Error(`bucket ${env.S3_BUCKET} not found at ${env.S3_ENDPOINT}`)
    }
    if (response.status >= 500) {
      throw new Error(`storage returned ${response.status}`)
    }
  })

  return result
}

function checkQueue(): CheckResult {
  const failures = recentEnqueueFailures()
  if (failures.length === 0) return { ok: true, durationMs: 0 }

  const latest = failures[failures.length - 1]
  return {
    ok: false,
    durationMs: 0,
    detail: `${failures.length} enqueue failure(s) in the last window; latest: ${latest?.queue ?? '?'} — ${latest?.message ?? '?'}`,
  }
}

export async function checkHealth(): Promise<HealthReport> {
  const [database, migrations, storage] = await Promise.all([
    checkDatabase(),
    checkMigrations(),
    checkStorage(),
  ])
  const queue = checkQueue()

  return {
    status: database.ok && migrations.ok && storage.ok && queue.ok ? 'ok' : 'degraded',
    checkedAt: new Date().toISOString(),
    environment: env.APP_ENV,
    checks: { database, migrations, storage, queue },
  }
}
