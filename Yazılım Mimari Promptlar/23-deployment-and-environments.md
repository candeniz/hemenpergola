# 23 — Deployment & Environments

## Environments

| Env | Purpose | Data | Notes |
|---|---|---|---|
| `local` | development | seed `minimal` / `demo` | Postgres+PostGIS in Docker, storage via MinIO |
| `preview` | per-PR | ephemeral DB from `e2e` seed | destroyed with the PR |
| `staging` | pre-release | anonymised copy of production | `robots: Disallow: /`, real integrations in sandbox |
| `production` | live | real | EU/TR region only (`19-security-and-kvkk.md` §Data location) |

Staging must never hold un-anonymised production personal data. The anonymisation script is
the same one erasure uses — one implementation, exercised weekly instead of once a year.

## Runtime

One Node.js container running the Next.js server, plus one worker process for pg-boss jobs
from the **same image** with a different entrypoint. Same code, same migrations, no drift.

```
web       → next start          (stateless, N instances behind a load balancer)
worker    → node dist/worker.js (1..2 instances; jobs are idempotent)
postgres  → 16 + PostGIS, primary + PITR
storage   → S3-compatible bucket + CDN for public paths
```

Stateless web is why sessions are cookies + DB, uploads go straight to object storage, and
messaging polls instead of holding sockets (`15-messaging.md`).

## Configuration

All configuration is environment variables, validated at boot by a Zod schema in
`src/shared/config/env.ts`. A missing or malformed variable **fails startup** — never a
silent default in production.

```
DATABASE_URL  DIRECT_URL  AUTH_SECRET  AUTH_URL
S3_ENDPOINT  S3_BUCKET  S3_ACCESS_KEY  S3_SECRET_KEY  CDN_BASE_URL
MAIL_PROVIDER  MAIL_API_KEY  MAIL_FROM
SMS_PROVIDER  SMS_API_KEY  SMS_SENDER
GEOCODER_API_KEY
SENTRY_DSN  LOG_LEVEL  APP_ENV  NEXT_PUBLIC_SITE_URL
```

Nothing secret goes into a `NEXT_PUBLIC_*` variable. Secrets live in the platform's secret
store, are rotated on a schedule, and rotation is a documented runbook step, not tribal
knowledge.

## Migrations

`prisma migrate deploy` runs as a release step **before** the new version receives traffic.

Rules that keep deploys reversible:

- Expand → migrate → contract. Add the new column, backfill, ship code that writes both,
  then drop the old column in a later release. Never rename in one step.
- No destructive migration in the same release as the code that stops using the column.
- Every migration is tested against a staging copy of production-sized data before release.
- PostGIS extension and indexes are created in migrations, not by hand on the server.
- **The production database is created with the same locale as every other environment:
  `--locale=C --encoding=UTF8`.** Collation is a create-time property of the cluster, so
  getting it wrong is not a migration away from being fixed — it is a dump, recreate and
  restore. Turkish-sorted columns carry their own `COLLATE "tr-TR-x-icu"`
  (`04-data-model.md` §Conventions); the cluster itself stays byte-order. Verify on any new
  database before the first migration runs: `SHOW lc_collate;` must report `C`.

Rollback: redeploy the previous image. Because migrations are expand-only within a release,
the previous image still runs against the new schema. A migration that breaks this rule
needs an explicit, rehearsed rollback plan in the PR.

## Pipeline

```
push → lint + typecheck → unit → integration (testcontainers) → build
     → e2e (preview env) → a11y + Lighthouse → [main] deploy staging → smoke → deploy prod
```

Gates that block a release: any failing stage, a non-empty `prisma migrate diff` against the
committed schema, an OpenAPI regeneration diff, an authorisation-matrix gap, and a failing
`e2e/core-flow.spec.ts` (`20-testing-strategy.md`).

Production deploys are rolling with a health check on `/api/health` (DB connectivity,
migration version, storage reachability). Jobs drain before a worker is replaced.

## Backups and recovery

| What | Policy |
|---|---|
| Postgres | continuous WAL archiving, PITR window 14 days, nightly full, 30-day retention |
| Object storage | versioning on, lifecycle to cold after 90 days |
| Secrets | in the secret store, backed up out of band |

Targets: **RPO 15 minutes, RTO 4 hours.** A restore rehearsal — including a point-in-time
restore into a scratch environment — runs quarterly and before launch
(`19-security-and-kvkk.md` §Pre-launch). An untested backup is a hypothesis.

## Observability

- Structured JSON logs shipped to the log platform, `requestId` correlated, 12-month
  retention for access logs.
- Error tracking (Sentry) with releases and source maps; PII scrubbed before send.
- Metrics: request rate/latency/error by route, job queue depth and failure rate, match+price
  p95, notification delivery success, DB connections and slow queries.

Alerts that page someone: error rate > 2% for 5 min, match+price p95 > 5 s, job dead-letter
growth, failed-login spike, storage or mail provider unreachable, disk > 80%, certificate
expiry < 14 days.

## Scaling order

When it gets slow, in this order: fix the query and add the index → cache the public page →
add web instances → read replica for public reads → materialised views for aggregates. A
search cluster or a service split is not on this list without an ADR
(`00-project-overview.md` §Non-goals).

## Runbooks

Kept in `ops/runbooks/`, each one page, each rehearsed at least once: restore from backup,
rotate a leaked secret, drain and replace a worker, replay dead-letter jobs, disable a
provider integration, respond to a suspected data breach (72-hour KVKK clock,
`19-security-and-kvkk.md` §Incident response).
