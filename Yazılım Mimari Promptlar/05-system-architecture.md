# 05 — System Architecture

## Shape

One Next.js 15 application, deployed as one unit, internally split into modules with
explicit boundaries. Not microservices, not a layered "controllers/services/models" tree.

```
src/
  app/                        presentation only — no business logic, ever
    (public)/[locale]/...     SSR/ISR marketing, catalogue, manufacturer profiles
    (customer)/[locale]/...   dashboard, projects, requests
    (manufacturer)/[locale]/... portal
    (admin)/[locale]/...      admin panel
    api/v1/...                route handlers — thin adapters
  modules/
    iam/                      users, companies, memberships, permissions, consent
    catalog/                  categories, products, attributes, options
    project/                  project creation, configurator rendering, validation
    pricing/                  price books, calculation engine
    matching/                 service areas, scoring, match runs
    offer/                    offer requests, appointments, offers, state machine
    messaging/                threads, messages
    review/                   reviews, moderation, responses
    media/                    uploads, image variants
    content/                  CMS pages, SEO records
    notification/             templates, channels, dispatch
    audit/                    audit log writer and reader
  shared/
    db/                       Prisma client, extensions, transaction helper
    result/                   Result type, domain error taxonomy
    money/                    kuruş helpers, formatting
    geo/                      PostGIS helpers
    config/                   typed env
  i18n/                       next-intl setup, message catalogues
```

Each module has three folders:

```
modules/<name>/
  domain/          entities, value objects, invariants, pure functions. No imports from
                   infrastructure, no Prisma, no Next.
  application/     use-case services. Takes an ActorContext, asserts permissions, orchestrates,
                   returns Result<T, DomainError>. The only place transactions are opened.
  infrastructure/  Prisma repositories, storage/mailer adapters, external clients.
```

**The rule that keeps this honest:** `app/` may import only from `application/`. A Prisma
call in a page or a server action is a review-blocking defect. Enforced by an ESLint
`no-restricted-imports` boundary rule, not by good intentions.

## Two entry points, one implementation

```
Server Action  ──┐
                 ├──► application service ──► domain + repository ──► Postgres
/api/v1 handler ─┘
```

Both are adapters: parse input with the **same Zod schema**, build an `ActorContext`, call
the service, map `Result` to their own transport. A feature is not "done" if it works
through a server action but has no route-handler path, because the mobile app in the next
phase consumes `/api/v1` and a retrofitted API is a rewrite (`00-project-overview.md`).

Web forms use server actions (progressive enhancement, no client fetch layer). Everything a
mobile client would need exists under `/api/v1` — see `06-api-specification.md`.

## ActorContext

```ts
type ActorContext = {
  userId: string | null
  globalRole: 'CUSTOMER' | 'ADMIN' | null
  anonymousKey: string | null       // the draft cookie's key (ADR-023); see below
  companyId: string | null          // resolved from the route, never from session state
  companyRole: CompanyRole | null
  companyStatus: CompanyStatus | null
  locale: 'tr' | 'en'
  ip: string
  userAgent: string
}
```

Built once per request in `src/shared/context/actor.ts`. Services never read cookies,
headers or `auth()` themselves — that is what makes them callable from jobs and tests.

**`anonymousKey` is the ninth field and the only one added since Phase 0** (`ADR-023`,
Phase 4 task 4.5). A visitor may configure a project without an account
(`10-project-configurator.md` §Anonymous drafts), so a `Project` row is owned by *exactly one
of* `customerId` / `anonymousKey` — `04-data-model.md` §Project enforces it with a CHECK
constraint. The key is an identity, so it is resolved here with the others rather than
threaded through each service's input, where a call site could forget it.

It is **present even when `userId` is set**, because `POST /projects/{id}/claim` needs the
account that will own the draft and the cookie that owns it now in the same request. Ownership
is still unambiguous: the project service's `ownedBy()` gives `userId` precedence. The CHECK
constraint keeps the *row* unambiguous; precedence keeps the *query* unambiguous.

## Errors

Services return `Result<T, DomainError>`; they do not throw for expected failures.

```ts
type DomainError =
  | { kind: 'NOT_FOUND'; entity: string }
  | { kind: 'FORBIDDEN'; permission: string }
  | { kind: 'VALIDATION'; issues: ZodIssue[] }
  | { kind: 'CONFLICT'; reason: string }        // e.g. illegal state transition
  | { kind: 'PRECONDITION'; reason: string }    // e.g. company not verified
  | { kind: 'RATE_LIMITED'; retryAfter: number }
  | { kind: 'DEPENDENCY'; service: string }     // storage, mail, geocoder
```

Adapters map: `NOT_FOUND`→404, `FORBIDDEN`→403 (renders
`access_denied_permission_required`), `VALIDATION`→422, `CONFLICT`→409,
`PRECONDITION`→409, `RATE_LIMITED`→429, `DEPENDENCY`→503. Thrown exceptions are bugs and
reach the error boundary and the logger, never the user.

## Ports and adapters

Four things are behind interfaces because they are the things that get swapped:

| Port | V1 adapter | Why a port |
|---|---|---|
| `StorageProvider` | S3-compatible | local disk in tests, provider change later |
| `Mailer` | Resend, SMTP fallback | deliverability providers change |
| `SmsSender` | Turkish SMS gateway | phone verification, provider is market-specific |
| `Geocoder` | geocoding API + cache table | rate limits, cost, offline tests |

Everything else talks to Postgres directly. Do not add a port "for flexibility" without a
second implementation in sight.

## Background work

pg-boss on the same Postgres. No Redis, no separate broker in V1.

| Job | Trigger | Notes |
|---|---|---|
| `offer_request.sla_expire` | scheduled on request creation | auto-decline, notify both sides |
| `notification.dispatch` | on domain event | email/SMS/in-app fan-out |
| `media.process` | on upload | variants, dimensions, virus scan status |
| `search.reindex_company` | on profile/portfolio change | refreshes tsvector column |
| `geo.geocode_service_area` | on radius service area save | fills `centerPoint` |
| `company.analytics_refresh` | on review publish/reject/response, offer decisions | recomputes `Company`'s denormalised aggregates from source (`16` §Aggregates) |
| `audit.retention_sweep` | nightly | applies the retention policy in `19-security-and-kvkk.md` |

Matching and pricing are **not** jobs. They run in the request (`03-user-flows.md` §F1/3).

## Caching

- Public catalogue and CMS pages: ISR with tag-based revalidation on admin publish.
- Manufacturer profiles: ISR, revalidated on profile/portfolio/review changes.
- Price books: in-process memoisation per request only. Never cache across requests — a
  stale price book is a wrong price.
- Match results: persisted in `MatchRun`/`MatchResult`, so revisiting results does not
  recompute. Recompute only when the project changes.

## Observability

Structured JSON logs with `requestId`, `userId`, `companyId`, `route`, `durationMs`. Every
domain event that changes money, status or disclosure is logged at info with its entity id.
p95 budgets that matter: match+price ≤ 2.5 s, catalogue page TTFB ≤ 400 ms, dashboard list
≤ 800 ms. Breaching a budget is a bug with an owner, not a metric to admire.

## What is deliberately not here

No GraphQL, no event bus, no CQRS, no separate BFF, no Docker Compose zoo. Anything that
adds a network hop between two things that ship together needs an ADR
(`24-decisions-log.md`) and, so far, none of them earns one.
