# CLAUDE.md

Guidance for any AI agent working in this repository.

## Layout

| Path | What |
|---|---|
| `Yazılım Mimari Promptlar/` | the numbered documents `00`–`26`. **Every bare `NN-*.md` reference in any document resolves here**, including inside the documents themselves |
| `Frontend Tasarım/stitch_outdoor_architectural_marketplace/` | 77-screen design reference |
| `src/`, `prisma/`, `e2e/`, `test/` | application code, at the repository root |

Both reference folders are committed and both are excluded from the Next.js build, from
`tsconfig.json` and from lint. Never import from them.

## Read this much, and no more

`README.md` is the router: it maps a task to the two or three documents it needs. Read those.
Do **not** read the whole documentation set for one feature — it burns context and produces
worse code, not better.

Always: `00-project-overview.md` on a first visit, `25-progress.md` before starting, and
`25-progress.md` again to append when finishing.

## State of the repository

**Phases 0 and 1 are built and their gates are proven, and Phase 2 is half done**
(2026-08-16). The foundation, the design system, the four shells, `modules/iam` — accounts,
credentials, tokens, the authorisation matrix, companies and memberships, audit and rate
limits — and `modules/catalog`, the admin catalogue CRUD and the `PlatformSetting` surface.

**Phase 2 tasks 2.3, 2.4 and 2.5 are next**: the real catalogue content, the manufacturer
verification queue and the audit viewer. `26-execution-plan.md` §Phase 2 for the ordered
tasks and the evidence each one needs. Read `25-progress.md` first — it is the only place that
says what is actually done, and its §Open questions is where the things nobody has decided yet
are written down.

`modules/iam/` is the template every later module copies: `domain/` pure, `application/`
framework-agnostic and returning `Result`, `infrastructure/` for Prisma and adapters, and
server actions in `app/actions/` rather than in the module.

## Non-negotiables

1. **Money is integer kuruş** (`Int`), end to end. A `Float` or a formatted string carrying
   money is a defect (`ADR-005`).
2. **No Prisma call in `app/`.** Pages, layouts, server actions and route handlers call
   application services only (`05-system-architecture.md`).
3. **Every service method asserts its permission first**, and ownership lives in the `where`
   clause, never in a post-fetch comparison (`12-authentication-authorization.md`).
4. **Status changes go through the state machine**, never a direct `status` write
   (`11-offer-request-lifecycle.md`).
5. **Customers never see price line items** — only the band from `EstimateBand`
   (`ADR-006`).
6. **No hardcoded user-facing strings.** Everything through next-intl, `tr` and `en`
   (`I18N-01`).
7. **No hex literals or arbitrary Tailwind values** in components — tokens only
   (`22-design-system.md`).
8. **Contact data is disclosed only on acceptance**, with consent, a `ContactDisclosure`
   row, an audit entry and a notification (`19-security-and-kvkk.md`).
9. **Nothing under `src/app` *evaluates* configuration or the database at module scope.**
   Next walks a route's module graph while collecting page data — at *build* time — so a
   **static** `import` of anything that reads `env` or constructs the Prisma client makes
   `pnpm build` require production secrets again, undoing
   `23-deployment-and-environments.md` §Configuration.

   The ban is on the evaluation, not on the dependency: `await import(...)` inside a handler,
   a component or a server action is fine, because the module is only evaluated when the
   request runs. `import type` is fine too — types are erased. This applies transitively:
   a file in `app/` that statically imports a *second* `app/` file which statically imports a
   service is the same bug one step further away, which is why server actions live in `app/`
   and reach their service through `await import(...)`.

   This has cost two bugs already (`/dev` layout, `/api/health`). It is a lint error on
   static imports, and the CI build job runs with no `.env` so it stays findable.

## Do not build these

Designed, deliberately deferred: plans, subscriptions, invoices/payments
(`ADR-010`) and the configurator rules engine (`ADR-008`). Their Stitch screens exist. A
design existing is not a decision to build it. If you think one is now needed, write an ADR
in `24-decisions-log.md` and ask — do not just start.

## Working with the Stitch designs

`Frontend Tasarım/stitch_outdoor_architectural_marketplace/` — 77 screens. Specification,
not source. Copy layout, hierarchy, states and copy intent. Never copy the CDN Tailwind
config, the inline `<script>` blocks, or the `googleusercontent` image URLs (they expire).
Canonical theme and conflict-resolution rules: `22-design-system.md`. Screen → route map:
`07-frontend-architecture.md`.

Nine screens have placeholder PNGs (`<FIFE Image failed to fetch>`); use their `code.html`.

## Conventions

- TypeScript strict. No `any`; `unknown` plus a Zod parse at boundaries.
- Services return `Result<T, DomainError>` and do not throw for expected failures.
- One Zod schema per use case in `modules/*/application/dto`, shared by the action, the route
  handler and the tests.
- Server Components by default; `'use client'` only for real interactivity.
- Turkish is the default locale and the root URL path; `en` is prefixed.
- Dates: UTC in the database, `Europe/Istanbul` for display.
- Commits and PRs cite requirement ids where they apply (`REQ-PRJ-04`, `PRC-03`).

## Definition of done

- The requirement id it satisfies is named.
- Tests exist at the level `20-testing-strategy.md` requires for that area — and for new
  service methods, an authorisation-matrix entry, or the build fails.
- Both locales render; loading, empty, error and forbidden states exist.
- If a decision was made, it is an ADR. If a doc is now wrong, it is fixed in the same PR.
- `25-progress.md` is updated.

## When the documentation and the brief disagree

The documentation wins, and `24-decisions-log.md` says why — the brief contradicts itself in
at least two places (§7 vs §32 on pricing, §17 vs §7 on KDV) and omits KVKK entirely. If you
find a new contradiction, resolve it in a doc plus an ADR rather than in code comments.

## When something is genuinely ambiguous

Check `25-progress.md` §Open questions — it may already be logged with a default. If it is
not, do everything that does not depend on the answer, state the assumption you made, and add
the question to that table.
