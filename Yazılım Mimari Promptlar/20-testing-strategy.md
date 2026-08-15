# 20 — Testing Strategy

## What gets tested, and how hard

| Area | Level | Standard |
|---|---|---|
| Pricing engine | unit, pure | exhaustive; every mode, rule, rounding boundary |
| State machine | unit, pure | every transition, every guard, every illegal edge |
| Matching | integration (real Postgres/PostGIS) | filters, scoring, ranking, zero-result |
| Authorisation | integration matrix | every role × every service method |
| Services | integration | happy path + each `DomainError` |
| Route handlers / actions | integration | shape, status mapping, idempotency |
| Core flow | e2e | the release gate |
| Components | unit | only where logic exists (band display, wizard step) |

Coverage targets: `modules/*/domain` **95%**, `modules/*/application` 85%, overall 75%. The
first number is the one that matters — that is where money and state live.

## Unit — pure domain

Vitest, no database, no mocks-of-mocks.

```
pricing/engine.spec.ts
  - each option mode: FLAT, PER_M2, PER_M, PER_UNIT, PERCENT
  - min project price floor applies last, after rules and regional
  - regional FLAT and PERCENT; district overrides city
  - rounding: half away from zero, once per step; kuruş never fractional
  - band: percent vs min width, rounding step, band never negative
  - zero/absent basis, missing option price, empty rule set
  - property test: net is monotonic in area; band always contains net

offer/state-machine.spec.ts
  - transition table row by row (table-driven from the doc)
  - every illegal (state, event) pair returns CONFLICT
  - guards: SLA expiry, past scheduledAt, empty offer lines
```

Golden files: a set of (project, price book) fixtures with expected breakdowns, committed.
A change to any golden value must be an intentional line in the PR, and it must bump
`engineVersion` (`08-pricing-engine.md`).

## Integration — real database

Testcontainers with `postgis/postgis:16`, migrations applied once per run, each test in a
transaction rolled back at the end. No shared mutable fixture state.

Non-negotiable suites:

- **Service areas:** city, district and radius containment, including a project just inside
  and just outside a radius boundary.
- **Matching:** unverified excluded; product-less excluded; out-of-area excluded; unpriced
  ranked below priced; ranking deterministic across repeated runs.
- **Authorisation matrix:** generated from the permission catalogue — for each service
  method, each of `OWNER/ADMIN/SALES/VIEWER/other-company/customer/anonymous/admin` gets the
  expected allow or `FORBIDDEN`. A new method with no matrix entry **fails the build**.
- **Disclosure:** contact fields absent in the `PENDING` DTO, present in `ACCEPTED`, with
  `ContactDisclosure` + `AuditLog` written exactly once, and idempotent under a double accept.
- **Concurrency:** simultaneous accept and decline → one succeeds, one gets `409`.
- **Immutability:** publishing a price book v2 does not alter any stored `PriceCalculation`.

## End to end — the release gate

Playwright, `e2e/core-flow.spec.ts`, walking the nine steps of `03-user-flows.md` §F1 across
three browser contexts (customer, manufacturer, admin) against a seeded database. A failing
core-flow spec blocks the release. Nothing else has that status.

Secondary e2e specs: registration + verification, manufacturer onboarding to first published
price book, decline and re-select, SLA expiry (clock advanced via a test-only endpoint),
review submission and moderation, and each failure path in `03-user-flows.md`.

## What is deliberately not tested

- Static Stitch HTML in `Frontend Tasarım/` — reference material, not shipped code.
- Deferred modules (`ADR-010`) — no tests for code that does not exist.
- Third-party SDK internals. Ports are faked in tests; the adapters get one smoke test each
  against a sandbox.
- Snapshot tests of markup. They fail on every design change and catch nothing.

## Test data

One seed script, three profiles: `minimal` (dev), `demo` (realistic — 20 companies, 8 cities,
published price books, reviews, portfolio), `e2e` (deterministic fixed ids). Seeds live in
`prisma/seed/` and are part of the build. A demo dataset that only exists on someone's laptop
is how the first demo goes wrong.

## Pipeline

```
lint + typecheck  →  unit  →  integration (testcontainers)  →  build  →  e2e  →  a11y + Lighthouse
```

Every stage blocks. Additional gates: `prisma migrate diff` must be empty against the
committed schema, the OpenAPI artifact must regenerate without diff, and the authorisation
matrix must cover every service method. Flaky specs are quarantined with an owner and a
deadline, never re-run until green.

## Manual checks before release

Turkish and English copy on the five public templates; Turkish characters in slugs, names
and PDFs; KDV arithmetic on a real offer against a hand calculation; an SMS and an email
actually arriving; and one full pass on a mid-range Android phone over a slow connection,
because that is what most customers will use.
