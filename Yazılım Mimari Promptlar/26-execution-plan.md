# 26 — Execution Plan

`21-development-roadmap.md` says **what** each phase contains and what its gate is. This file
says **how to start each one**, in order, with the artefact and the evidence for every step.
Where the two disagree, `21` wins on scope and this file wins on sequencing.

Assumption stated up front: **one full-time developer**. Every "parallel" claim in `21` is
re-evaluated below on that basis. If that changes, the only section that changes is
§Sequencing.

---

## Before Phase 0 — three things that are not code

These are not warm-up tasks. Two of them have external lead times, and one of them is the
supply side of a two-sided marketplace, which no amount of code substitutes for.

### D1 · The decision chain nobody drew: Q1 → Q2 → Q3

`25-progress.md` lists brand name (Q1), legal entity (Q2) and SMS provider (Q3) as three
independent open questions, and marks Q2 as "blocks launch, not development". That is wrong
in one specific way, and it is the kind of wrong that surfaces four months late:

```
Q1 brand name  ──►  Q2 legal entity + İYS registration  ──►  Q3 SMS sender ID
                                                              │
                                                              ▼
                                              real phone verification (Phase 1 gate,
                                              hard-blocks contact disclosure, Phase 6)
```

A Turkish alphanumeric SMS sender ID is allocated only to a business registered in **İYS**
(İleti Yönetim Sistemi), which needs a registered legal entity. The provider-side approval of
the header itself is fast — commonly 1–3 business days — so the lead time everyone worries
about is the wrong one. The real lead time is company registration plus İYS enrolment, and it
sits in front of it.

**Therefore:** start the legal entity now, in parallel with Phase 0. Development is not
blocked (the log-only `SmsSender` adapter is the correct dev default and stays), but the
production path is, and `12-authentication-authorization.md` makes phone verification a hard
gate on disclosure — the single most important transition in the product.

The brand name is upstream of all of it, because the sender ID *is* the brand. Until it is
chosen, `{brand}` is an i18n token and a `PlatformSetting`, never a string literal — that part
of `25`'s default is right and should be honoured from the first commit.

### D2 · Catalogue content is a workstream, not a task

`21` Phase 2 says "the seed catalogue of `CAT-02`" in six words. What it actually requires is
somebody who knows pergolas writing, per product: the attribute set, units, min/max/step, which
attributes are required, which affect price, and the option lists — with `tr` and `en` labels
and help text.

Phase 4 (configurator) and Phase 5 (pricing) both consume it, and neither can be demonstrated
against invented data without the demo being invented too. Start drafting it during Phase 0,
in a spreadsheet, against `04-data-model.md` §Catalogue. Two products fully specified beats
eight sketched.

### D3 · One pilot manufacturer, found before Phase 3 ends

The largest risk in the register — "price-book data entry is too laborious" — cannot be
retired by design review. It is retired by watching one real manufacturer fill in one real
price book and seeing where they stop.

Find that manufacturer during Phase 0–2. Phase 3 ships the price-book UI; the week it ships,
put it in front of them. If the answer is "I am not typing all this", that is a Phase 3
finding worth an ADR, not a Phase 9 launch surprise.

---

## Sequencing

`21` §Dependencies says Phases 3 and 4 are "genuinely parallel if two people are working".
With one developer they are not parallel, and the order is not arbitrary:

**Run 3 before 4.** Phase 3 carries the project's largest un-derisked assumption (D3) and the
data model with the most surface area (`PriceBook*`, five tables, five option modes, two
adjustment modes). Phase 4 is the more visible half but the better-understood one — the wizard
is a form over `ProductAttribute` rows, and `ADR-008` already removed its scope risk.

Front-load the thing that can still teach you something. A demo of a beautiful wizard that
prices nothing is worth less than an ugly price-book screen that a real manufacturer filled in.

```
0 ─► 1 ─► 2 ─► 3 ─► 4 ─► 5 ─► 6 ─► 7 ─► 8 ─► 9 ─► 10 ─► 11
              ▲                    ▲                          ▲
              │                    │                          └─ built alongside the launch
              │                    │                             checklist, in the stores
              │                    │                             after it (ADR-030)
              │                    └─ first demo worth showing (unchanged from 21)
              └─ D3 pilot feedback lands here, while it is still cheap
```

D1 and D2 run alongside 0–2 and must be closed by the phase named in §Decision calendar.

---

## Phase 0 — Foundation

Entry: nothing. Exit gate (`21`): an empty page renders in both locales through the real
shells, and the pipeline runs green end to end.

That gate is right but under-specified — it can be met by a project that is impossible to
build Phase 1 on. The tasks below are ordered so each one is verifiable when it lands.

| # | Task | Artefact | Evidence it is done |
|---|---|---|---|
| 0.1 | Repo, pnpm, Next.js 15 App Router, TS strict, ESLint, Prettier, commit hooks | `package.json`, `tsconfig.json` | `pnpm build` and `pnpm typecheck` green, `any` banned by lint |
| 0.2 | Typed env | `src/shared/config/env.ts` | removing one required var fails **startup**, and a test asserts that |
| 0.3 | Local stack | `docker-compose.yml` — `postgis/postgis:16`, MinIO | `select postgis_version()` returns; MinIO bucket reachable |
| 0.4 | Prisma + migration 1 | `prisma/schema.prisma` | `prisma migrate diff` empty against the committed schema |
| 0.5 | Geography seed — 81 cities, districts, centroid points | `prisma/seed/geo.ts` | every `District` has a non-null `point`; count assertions in a test |
| 0.6 | `shared/`: `Result`/`DomainError`, kuruş helpers, PostGIS helpers, Prisma client + transaction helper | `src/shared/*` | unit tests on rounding (half away from zero) and on `Result` mapping |
| 0.7 | `ActorContext` resolver, anonymous-only until Phase 1 | `src/shared/context/actor.ts` | returns an anonymous context; signature matches `05` |
| 0.8 | Module boundary lint rule | `eslint.config.*` `no-restricted-imports` | a **committed** fixture importing Prisma from `app/` fails CI on purpose |
| 0.9 | Design tokens | `src/app/[locale]/globals.css` (Tailwind 4 has no `tailwind.config.ts` — `@theme` is the config) | a `/dev/tokens` page renders the full palette, type scale and radii; compared side by side with `outdoor_systems_public_homepage_final` |
| 0.10 | Fonts + icons self-hosted | `next/font` Montserrat + Inter, latin-ext; Material Symbols variable | Turkish glyphs (ğ İ ş ı ç ö ü) render with no fallback flash |
| 0.11 | shadcn/ui init, primitives restyled centrally | `components.json`, `src/components/ui/*` | no hex literal anywhere under `src/components`; lint rule proves it |
| 0.12 | Four shells with the density split | `src/components/layouts/*` | `PublicShell` 48/80 rhythm, `PortalShell`/`AdminShell` 8/12 — visually diffed against `22` §Density |
| 0.13 | next-intl, `tr` unprefixed default + `en` prefixed, namespaced catalogues, `{brand}` token | `src/i18n/*` | `/` and `/en` both render; a lint rule flags hardcoded user-facing strings |
| 0.14 | CI pipeline, all stages wired even where empty | `.github/workflows/*` | lint → typecheck → unit → integration → build → e2e → a11y all execute |
| 0.15 | Testcontainers harness + `/api/health` | `test/setup.ts`, `app/api/health/route.ts` | health returns DB connectivity, migration version, storage reachability |
| 0.16 | `e2e/core-flow.spec.ts` skeleton, nine `test.skip` steps from `03-user-flows.md` §F1 | `e2e/core-flow.spec.ts` | the release gate exists from day one and un-skips a step per phase |
| 0.17 | Seed profiles `minimal` / `demo` / `e2e` scaffolded | `prisma/seed/` | each profile runs to completion against an empty DB |

**Migration granularity.** One migration per phase, named for it. The deferred `ADR-010`
tables (`Plan`, `Subscription`, `Payment`, `LeadCredit`, `ConfiguratorQuestion`,
`ConfiguratorRule`) ship in migration 1 and are never touched again — that is the whole point
of modelling them, and doing it now means nobody re-litigates it in Phase 7. This is a
decision; if it is adopted, it wants **ADR-014**.

**Most likely to go wrong here:** 0.8 and 0.9. A boundary rule that is not proven by a
failing fixture is decoration, and tokens that were eyeballed rather than diffed against a
`_final` screen produce eleven PRs of drift. Both are cheap now and expensive in Phase 8.

---

## Phase 1 — Identity

Entry: 0.7, 0.8, 0.13 done. Gate (`21`): the authorisation matrix covers every service method,
and a company reaches `PENDING`.

| # | Task | Notes |
|---|---|---|
| 1.1 | Permission catalogue as string constants | `modules/iam/domain/permissions.ts` — the source `02`'s table is regenerated from, never hand-edited |
| 1.2 | Argon2id credentials, identical response shape and latency for unknown email vs wrong password | `12` §Credentials |
| 1.3 | Auth.js v5 cookie sessions + Bearer JWT for `/api/v1`, **no `companyId` claim** | `ADR-003` |
| 1.4 | Register / login / reset, email verification | screens: `register_`, `login_`, `forgot_password_`, `email_verification_` |
| 1.5 | Phone OTP behind the `SmsSender` port; **log-only adapter** | real provider lands when D1 clears — the port is the whole point |
| 1.6 | Company registration → `OWNER`, memberships, invitations | `manufacturer_team_management` |
| 1.7 | `resolveActor` full implementation — company scope from the **path**, never the session | `12` §Context resolution |
| 1.8 | Authorisation matrix suite, generated from 1.1 | **a service method with no matrix entry fails the build** — wire this now, not in Phase 6 |
| 1.9 | Auth events to `AuditLog`, rate limits, progressive delay | `12` §Abuse controls |

**Most likely to go wrong:** 1.8 arriving late. Built in Phase 1 it costs a day and stays
true. Retrofitted in Phase 6 it means auditing sixty methods at once, and the gate for every
phase in between was never real.

---

## Phase 2 — Catalogue and admin skeleton

Entry: Phase 1 gate met, D2 draft catalogue exists. Gate: an admin adds a product and its
options with no deployment, and verifies a manufacturer.

| # | Task |
|---|---|
| 2.1 | `Category` / `Product` / `ProductAttribute` / `ProductOption` + translations + `Seo` rows |
| 2.2 | Admin catalogue CRUD — `super_admin_product_catalog_management` |
| 2.3 | Seed the D2 catalogue for real, `tr` and `en` |
| 2.4 | Verification queue and decisions — `super_admin_manufacturer_verification` (+ `_detail`) |
| 2.5 | `AuditLog` writer and viewer — `super_admin_audit_logs`, with `TimelineItem` |
| 2.6 | `AdminShell` navigation — **deferred screens are absent from it entirely** (`ADR-010`) |
| 2.7 | `PlatformSetting` read/write surface — band width, round step, SLA hours, KDV rate, match weights all land here rather than in code |

**Most likely to go wrong:** 2.3 being done by whoever is free rather than whoever knows
pergolas. `showIfAttributeKey` is the only conditionality V1 has (`ADR-008`); a catalogue that
needs more than one level is telling you something, and the answer is to reshape the
attributes, not to reopen the rules engine.

---

## Phase 3 — Manufacturer supply side ← run before Phase 4

Entry: Phase 2 gate met, pilot manufacturer identified (D3). Gate: a verified company has a
published price book, service areas and products — it is matchable.

| # | Task |
|---|---|
| 3.1 | Company profile, documents, `CompanyContact` — `manufacturer_company_settings` |
| 3.2 | Product/option offering — `CompanyProduct`, `CompanyProductOption` (`manufacturer_product_management`) |
| 3.3 | Price book draft → publish → archive, immutable when `PUBLISHED`, partial unique index on one live book per company |
| 3.4 | Price-book editor: base, min project value, per-option modes, region adjustments **`FLAT` and `PERCENT`** (`manufacturer_pricing_management`) |
| 3.5 | Simulator against a **draft** book, full breakdown, same company only — publishing to test is not a workflow |
| 3.6 | Service areas: city, district, radius + `geo.geocode_service_area` job (`manufacturer_service_area_management`) |
| 3.7 | Portfolio + `media.process` job (`manufacturer_portfolio_management`) |
| 3.8 | **Put 3.4 in front of the pilot manufacturer.** Write down where they stopped. |

3.5 needs the pure engine from `08`, so build `modules/pricing/domain/engine.ts` and its
golden-file tests here rather than in Phase 5. Phase 5 then wires an already-tested function
into matching instead of debugging arithmetic and SQL in the same week.

**Most likely to go wrong:** 3.4 as a form-shaped translation of the schema. Five option modes
× regional adjustments × rule kinds is a data-entry surface that a manufacturer meets once and
judges the whole platform by. Clone-from-version and sensible defaults are not polish here.

---

## Phase 4 — Project configurator

Entry: Phase 2 catalogue real (Phase 3 not strictly required). Gate: a project reaches `READY`
and survives a browser restart mid-wizard.

| # | Task |
|---|---|
| 4.1 | Three visible stages, ten logical steps, one stepper (`ADR-013`, `WizardStepper`) |
| 4.2 | Per-step `PATCH`, server-persisted; client holds current step and unsaved fields only |
| 4.3 | Dimensions in **mm**, area derived and displayed live, never typed |
| 4.4 | Attribute rendering from rows + single-level `showIf`, evaluated identically client and server |
| 4.5 | Anonymous drafts: `anonymousKey` cookie, 30-day TTL, ≤ 3 per key, `POST /claim` on register |
| 4.6 | Attachments — `PHOTO` **and** `DOCUMENT` (`FileDropzone`) |
| 4.7 | `POST /validate` → `{ ready, issues[] }`, each issue carrying its step |
| 4.8 | Customer dashboard + project list, `EmptyState` (`customer_dashboard_final`, `_empty_state`) |
| 4.9 | Duplicate project |

**Do not show option prices in the wizard** — no manufacturer has been chosen yet, and the
designs showing them predate `ADR-006`. The band appears at results.

**Most likely to go wrong:** 4.5. Anonymous → claimed is where sessions, cookies, retention
and ownership checks intersect, and it is the one flow a customer hits before they trust you.

---

## Phase 5 — Matching and pricing ← the milestone that matters

Entry: Phases 3 and 4 done, engine and golden files already green from 3.5.

| # | Task |
|---|---|
| 5.1 | Eligibility as a single SQL query — verified, offers product, covers area, offers required options, not suspended |
| 5.2 | Scoring: seven weighted components, Bayesian rating, newcomer allowance, **price is not a component** |
| 5.3 | Pricing pass per candidate; a pricing failure never removes a match |
| 5.4 | `ORDER BY priceOnRequest ASC, score DESC, distanceKm ASC, companyId ASC` — deterministic, tie broken by id |
| 5.5 | `MatchRun` / `MatchResult` persistence + `scoreBreakdown` |
| 5.6 | Results, comparison (max 3), `EstimateBand`, `ManufacturerCard`, skeleton loading states |
| 5.7 | Zero-result ladder: widen radius → "may be able to help" → notify-me subscription |
| 5.8 | `system_error_price_unavailable` as a **state inside the matches page**, not a route |
| 5.9 | p95 ≤ 2.5 s asserted in CI for ≤ 200 candidates |

**Build `EstimateBand` before the results page.** Every price a customer ever sees goes
through it; the disclosure rules live in one component or in eleven screens, and the second
option is how a line item leaks.

**Un-skip the first e2e steps here.** Configure → GET OFFERS → ranked priced results is
demonstrable at this gate.

---

## Phase 6 — Offer request lifecycle

Entry: Phase 5 gate met. **Q6 and Q7 must be answered before this starts** (see §Decision
calendar). Gate: `e2e/core-flow.spec.ts` green.

| # | Task |
|---|---|
| 6.1 | Pure state machine, table-driven from `11`, every illegal edge → `CONFLICT` |
| 6.2 | Service: load `FOR UPDATE` → transition → in-tx side effects → **notifications after commit** |
| 6.3 | Consent capture at creation with `textVersion` (`ConsentCheckbox`) |
| 6.4 | Disclosure at `PENDING → ACCEPTED`: `ContactDisclosure` + `AuditLog` + customer notification, **exactly once**, idempotent under double accept |
| 6.5 | Two DTOs, one route — pre- and post-disclosure. Never two pages, never UI-level hiding |
| 6.6 | SLA job, reminders at 50% and 90%, auto-decline, countdown visible to **both** sides |
| 6.7 | Appointments — `manufacturer_project_calendar`, `manufacturer_appointment_detail` |
| 6.8 | Offers: lines, tax **once on the net total**, `grossKurus`, `GSF-2026-0042` numbering, revision supersedes without overwriting |
| 6.9 | Offer view shows the original estimate beside the offer, labelled net of KDV (`ADR-007`) |
| 6.10 | Concurrency test: simultaneous accept and decline → one `409` |

**Most likely to go wrong:** 6.4 and 6.5 treated as a UI concern. The DTO boundary *is* the
KVKK control. If a `PENDING` DTO ever carries a phone number, no amount of frontend fixes it.

---

## Phase 7 — Communication and trust

Entry: Phase 6 gate met. Gate: every event in `13-notifications.md` fires with a rendered `tr`
template.

Messaging with 5 s / 30 s polling (`ADR-009`); the full notification catalogue across
in-app / email / SMS with preferences; reviews — one per `offerRequestId`, eligible from
`SURVEY_COMPLETED`, moderation and responses; manufacturer analytics; and the denormalised
aggregates (`avgRating`, `reviewCount`, `medianResponseMinutes`) that Phase 5 scoring already
reads — **maintained by jobs, never computed per request**.

If D1 has cleared, the real `SmsSender` adapter replaces the log-only one here and gets its
one smoke test.

---

## Phase 8 — Public site and SEO

Entry: Phases 2 and 3 have produced real content. Gate: five main templates meet the budgets
in `18-cms-seo.md`, in CI.

Homepage, category and product pages, manufacturer directory and profiles, city landing pages,
CMS with block editor, sitemaps, JSON-LD, redirects. Turkish slugs canonical, `en` with its own
slug set, stored per entity.

This phase is where the token discipline of 0.9–0.12 is cashed in or paid for. Seventeen of the
77 screens are in non-canonical themes and get **re-tokenised, not redesigned** (`ADR-012`).

---

## Phase 9 — Hardening and launch

Entry: Phase 8 gate met, Q2 and Q5 answered. Gate: the pre-launch checklist ticked by
evidence.

KVKK export and erasure jobs, retention sweep, consent and privacy texts **reviewed by a
lawyer** (Q2); security headers and rate limits; a real restore rehearsal including
point-in-time restore into a scratch environment; observability and the alert set; a load test
of the matching path; launch content; and the manual checks in `20-testing-strategy.md` —
including one full pass on a mid-range Android phone over a slow connection.

Launch city by city (Q5), not nationwide. Zero-result telemetry from Phase 5 is the input to
that decision, and it has been collecting since then precisely so this is a measurement rather
than an opinion.

---

## Phase 10 — The API the mobile app consumes

Entry: `ADR-030` accepted. Gate: `test/api-surface.test.ts` green — no capability reachable
from a server action alone, and every exception on the web-only list carries a written
reason.

Do the drift test **first and watch it fail**, before writing a single handler. It was
written in the measurement turn and produced the number that justifies this phase: 46
missing capabilities, listed by action. Adding endpoints until a red test turns green is a
different activity from adding endpoints until you think you are finished, and only the
first one ends.

Order the work by what the phone actually needs first, which is also the riskiest half:
`11`'s transitions (11 actions, none of them exposed today), then `09`'s match run and
results, then `15` and `16`. Company profile, supply-side and file endpoints follow.

Two specification gaps to close before implementing them, because `06` does not describe
them at all: **file upload** — `06` says `{ fileId }` in three request bodies and never says
where a `fileId` comes from, while `presign → complete → url` has existed in the code since
Phase 3 — and project duplication. Write them into `06` first; the rest of this phase is
implementation catching up with a specification that was already right.

Nothing new goes into the application layer here. If a route handler needs a service method
that does not exist, that is a sign the web surface was doing domain work in `app/`, and the
repair is to move it, not to write a second implementation behind the API.

---

## Phase 11 — Mobile application (Expo / React Native)

Entry: Phase 10 gate met. Gate: the core flow walkable on a physical device against
production, and a manufacturer answering a lead inside the SLA without a browser.

Scope is `ADR-030`'s table and it is a short list on purpose. The app splits by role after
login the same way the web splits into shells; the price-book editor, the simulator,
portfolio management, verification documents, admin and the CMS are not ported.

Reuse the Zod DTOs in `modules/*/application/dto` as the client contract — that is the
reason the language is TypeScript on both sides, and the reason Flutter lost. Auth is the
Bearer pair `06` §Auth already issues, with refresh in secure device storage; there is no
cookie on this client (`ADR-022` is a web-session decision and does not travel).

Push notifications extend `13`'s catalogue with a transport rather than inventing a second
catalogue. `ADR-027`'s at-least-once rule for mandatory events applies to push unchanged: a
duplicate push is a nuisance, a missing contact-disclosure notice is a KVKK problem.

**This phase must not block the launch.** Store submission needs A5 and C6 from `29`, both
behind Q2, and Apple's review adds days on top with a rejection costing a round trip. Build
while `29` is being worked through; submit after the web is live.

---

## Decision calendar

| Q | Question | Must be answered by | Consequence of drifting |
|---|---|---|---|
| Q1 | Brand name | **start of Phase 0** | `{brand}` token holds development, but Q2 and Q3 cannot start |
| Q2 | Legal entity, İYS registration, KVKK counsel | **during Phase 0–1** | gates the real SMS path and every launch text; the longest external lead time in the project |
| Q3 | SMS provider + sender ID | **Phase 6**, applied for in Phase 1 | log-only adapter covers development; disclosure cannot go live without it |
| Q4 | Geocoding provider and budget | start of Phase 3 | default is district centroids only — acceptable, but decide rather than default by accident |
| Q6 | KDV rate | start of Phase 6 | 20% is the current Turkish standard rate and covers pergola supply and installation; confirm with an accountant and keep it a `PlatformSetting` |
| Q7 | SLA window | start of Phase 6 | 48 h in `PlatformSetting`, tuned from real data — this one is genuinely fine to default |
| Q5 | Launch cities | Phase 9 | driven by Phase 5 zero-result telemetry, not by preference |

---

## Per-PR checklist

`CLAUDE.md` §Definition of done, plus the two that this plan adds:

- the phase and task number it belongs to (`P3.4`), alongside the requirement id
- if it is the first PR touching a `PlatformSetting`, the setting exists in the admin surface
  from 2.7 — not a constant with a `// TODO: make configurable`

---

## What this plan proposes changing elsewhere

Adopt or reject these explicitly; do not let them sit as this file's private opinion.

| Change | Where | Why |
|---|---|---|
| Q2 reclassified from "Phase 9" to "Phase 0–1" | `25-progress.md` §Open questions | it is upstream of Q3, which is upstream of the Phase 1 gate |
| Q1 → Q2 → Q3 recorded as a chain, not three rows | `25-progress.md` | the sender ID *is* the brand, and İYS needs the entity |
| Phases 3 and 4 sequenced 3-then-4 for one developer | `21-development-roadmap.md` §Dependencies | risk-first; "parallel if two people" is not the current situation |
| Pricing engine + golden files move to Phase 3 (3.5) | `21` Phases 3 and 5 | the simulator needs the engine; Phase 5 should wire, not debug |
| One migration per phase; `ADR-010` tables in migration 1 | proposed **ADR-014** | keeps `prisma migrate diff` meaningful and stops the deferred tables being re-argued |
| Catalogue content and pilot-manufacturer recruitment named as workstreams | `21` §Risk register | both are already risks there; neither has an owner or a start date |
