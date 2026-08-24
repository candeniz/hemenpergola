/**
 * The worker entrypoint — `23-deployment-and-environments.md` §Runtime.
 *
 * *"One Node.js container running the Next.js server, plus one worker process for pg-boss
 * jobs from the **same image** with a different entrypoint. Same code, same migrations, no
 * drift."*
 *
 * This is that entrypoint. It is the **only** place job handlers are registered; the web
 * tier sends and never works, which is what keeps `next start` stateless.
 *
 * ## Running it
 *
 * `pnpm worker` in development. Two flags on that script are not decoration:
 *
 *   `--conditions=react-server` — `server-only` is a marker package that resolves to an
 *   empty module under the `react-server` condition and *throws* under any other. Next sets
 *   the condition; plain Node does not, so without this the worker dies on its first import
 *   of anything in `infrastructure/`. The condition is honest here: a worker is a server.
 *
 *   `--env-file-if-exists=.env` — Next loads `.env` for the web tier and nothing loads it
 *   for a standalone Node process. In production the platform supplies the variables and
 *   there is no file, which is why it is the `if-exists` form.
 *
 * `23` §Runtime specifies `node dist/worker.js` in production. **That bundle does not exist
 * yet**: there is no Dockerfile and no build step for it, and inventing one for an image
 * nobody builds would be guessing at Phase 9. Carried in `25-progress.md`.
 */

import { ensureQueues, JOB, startBoss, stopBoss, type JobPayloads } from '@/shared/jobs'

/**
 * `23` §Runtime asks for drainage when a worker is replaced.
 *
 * On `SIGTERM` the boss stops accepting new work and waits for what is in flight; anything
 * that does not finish in time is returned to the queue and retried on the new instance,
 * which is safe precisely because every handler is idempotent.
 */
const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const

async function main(): Promise<void> {
  // Configuration is parsed here for the same reason `instrumentation.ts` parses it for the
  // web tier: a worker that starts with a missing variable and fails on the first job is a
  // worker that fails at 3am instead of at deploy time.
  const { env } = await import('@/shared/config/env')
  console.info(`[worker] starting · ${env.APP_ENV}`)

  const boss = await startBoss()

  boss.on('error', (error) => {
    // pg-boss surfaces connection trouble here rather than throwing into a handler.
    console.error('[worker] queue error', error)
  })

  // The policy lives with the queue names, not here — see `ensureQueues`.
  await ensureQueues()

  await boss.work<JobPayloads[typeof JOB.geocodeServiceArea]>(
    JOB.geocodeServiceArea,
    { batchSize: 5 },
    async (jobs) => {
      const { runGeocodeServiceArea } =
        await import('@/modules/matching/infrastructure/geocode-job')

      for (const job of jobs) {
        const outcome = await runGeocodeServiceArea(job.data.serviceAreaId)
        console.info(`[worker] ${JOB.geocodeServiceArea}`, job.data.serviceAreaId, outcome.status)
      }
    },
  )

  await boss.work<JobPayloads[typeof JOB.mediaProcess]>(
    JOB.mediaProcess,
    // One at a time: `sharp` renders five variants per image and holds the decoded bitmap in
    // memory while it does. A batch of ten large photos is how a worker gets OOM-killed.
    { batchSize: 1 },
    async (jobs) => {
      const { runMediaProcess } = await import('@/modules/media/infrastructure/media-job')

      for (const job of jobs) {
        const outcome = await runMediaProcess(job.data.fileId)
        console.info(`[worker] ${JOB.mediaProcess}`, job.data.fileId, outcome.status)
      }
    },
  )

  await boss.work<JobPayloads[typeof JOB.slaExpire]>(
    JOB.slaExpire,
    { batchSize: 10 },
    async (jobs) => {
      const { runSlaJob } = await import('@/modules/offer/infrastructure/sla-job')

      for (const job of jobs) {
        const outcome = await runSlaJob(job.data.offerRequestId, job.data.kind)
        console.info(
          `[worker] ${JOB.slaExpire}`,
          job.data.kind,
          job.data.offerRequestId,
          outcome.status,
        )
      }
    },
  )

  await boss.work<JobPayloads[typeof JOB.notificationDispatch]>(
    JOB.notificationDispatch,
    { batchSize: 10 },
    async (jobs) => {
      const { runNotificationDispatch } =
        await import('@/modules/notification/infrastructure/dispatch-job')

      for (const job of jobs) {
        const outcome = await runNotificationDispatch(job.data.notificationId)
        console.info(
          `[worker] ${JOB.notificationDispatch}`,
          job.data.notificationId,
          outcome.status,
        )
      }
    },
  )

  await boss.work<JobPayloads[typeof JOB.analyticsRefresh]>(
    JOB.analyticsRefresh,
    { batchSize: 5 },
    async (jobs) => {
      const { runAnalyticsRefresh } = await import('@/modules/review/infrastructure/analytics-job')

      for (const job of jobs) {
        const outcome = await runAnalyticsRefresh(job.data.companyId)
        console.info(`[worker] ${JOB.analyticsRefresh}`, job.data.companyId, outcome.status)
      }
    },
  )

  console.info(
    '[worker] ready · geo.geocode_service_area, media.process, offer_request.sla_expire, notification.dispatch, company.analytics_refresh',
  )

  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => {
      console.info(`[worker] ${signal} · draining`)
      void stopBoss()
        .then(() => process.exit(0))
        .catch((error: unknown) => {
          console.error('[worker] drain failed', error)
          process.exit(1)
        })
    })
  }
}

main().catch((error: unknown) => {
  console.error('[worker] failed to start', error)
  process.exit(1)
})
