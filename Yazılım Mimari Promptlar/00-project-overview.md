# 00 — Project Overview

## What this is

A marketplace connecting customers who want outdoor architectural systems (pergolas, winter
gardens, glass systems, shading) with verified manufacturers and installers.

Primary market: **Turkey**. Currency **TRY**. Default language **tr**, secondary **en**.

Platform for this phase: **web only**. A native mobile app comes later and will consume the
same HTTP API — see `05-system-architecture.md` §API surface.

## What makes it not a lead-gen site

The platform captures **structured project data** (product, dimensions, area, options, location)
and uses it to do two things a lead-gen form cannot:

1. **Match** manufacturers by capability, service area and verification — `09-manufacturer-matching.md`
2. **Estimate a price** per manufacturer from that manufacturer's own published price book — `08-pricing-engine.md`

Everything else in the product exists to support or follow from that flow.

## The one flow that matters

```
discover → configure project → GET OFFERS → matched + priced manufacturers
→ select manufacturer → send request → manufacturer accepts → contact disclosed
→ site survey → final offer → tracked to won/lost
```

Documented in full in `03-user-flows.md`. Its end-to-end test is the release gate (`20-testing-strategy.md`).

## Roles

| Role | Surface | Doc |
|---|---|---|
| Customer | public site + customer dashboard | `02-user-roles-and-permissions.md` |
| Manufacturer (company, multiple users) | manufacturer portal | same |
| Super Admin | admin panel | `17-admin-system.md` |

## Stack (decided)

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript, single deployable |
| ORM / DB | Prisma + PostgreSQL 16 with PostGIS |
| Auth | Auth.js v5 (cookie sessions, web) + Bearer JWT (`/api/v1`, mobile-ready) |
| Validation | Zod (shared between server actions, route handlers, forms) |
| Styling | Tailwind + shadcn/ui as the design-system base |
| Files | S3-compatible object storage behind a `StorageProvider` port |
| Jobs / email | pg-boss (Postgres-backed) + Mailer port (Resend or SMTP) |
| Search | PostgreSQL full-text + pg_trgm. No Elasticsearch in V1. |
| Tests | Vitest (unit/integration), Playwright (e2e) |

Rationale and rejected alternatives: `24-decisions-log.md` (ADR-001..003).

## Non-goals for V1

- Payments and subscriptions as working features — data model only (`ADR-010`).
- A general-purpose configurator rules engine — deferred, see `ADR-008`.
- Elasticsearch, microservices, event sourcing, multi-currency.

**No longer on this list: a mobile application.** It was the first entry here, and
`ADR-030` reverses it — an Expo / React Native app covering the core flow, built against
the same `/api/v1` the web already has, and submitted to the stores *after* the web
launches. It is still outside V1's launch, which is what this list is about; it is
`21-development-roadmap.md` Phases 10 and 11. The rest of the list stands.

## How to use this documentation

`README.md` in this folder is the router: it maps a task to the two or three files you
actually need to read. Do not read the whole `/docs` tree for one feature — see
`21-development-roadmap.md` §Working rules and the token discipline in the project brief §44.

Progress state lives in `25-progress.md` and is the only file updated after every task.
