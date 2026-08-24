# 21 — Development Roadmap

Ordered so that the core flow (`03-user-flows.md` §F1) is demonstrable as early as possible
and every later phase deepens it rather than adding a parallel feature.

## Phase 0 — Foundation

Next.js 15 + TS strict, Tailwind + shadcn/ui tokenised to the theme (`22-design-system.md`),
Prisma + PostGIS, typed env, Result/DomainError, `ActorContext`, module boundaries with the
ESLint import rule, next-intl with `tr`/`en`, base layouts (`PublicShell`, `DashboardShell`,
`PortalShell`, `AdminShell`), CI pipeline, testcontainers harness, seed profiles.

**Done when:** an empty page renders in both locales through the real shells, and the
pipeline runs green end to end.

## Phase 1 — Identity

Auth.js v5 + Bearer JWT, register/login/reset, email and phone verification, company
registration with `OWNER`, memberships and invitations, the permission catalogue, and the
authorisation matrix suite.

**Done when:** the matrix suite covers every service method that exists, and a manufacturer
company can be created and reaches `PENDING`.

## Phase 2 — Catalogue and admin skeleton

Categories, products, attributes, options with translations and SEO rows; the seed catalogue
of `CAT-02`; `super_admin_product_catalog_management`; verification queue and decisions;
audit log writer and viewer.

**Done when:** an admin adds a product and its options with no deployment, and verifies a
manufacturer.

## Phase 3 — Manufacturer supply side

Company profile and documents, product/option offering, price books (draft → publish →
archive) with the simulator, service areas including radius + geocoding, portfolio.

**Done when:** a verified company has a published price book, service areas and products —
i.e. it is matchable.

## Phase 4 — Project configurator

The wizard (three stages, ten steps), per-step persistence, anonymous drafts and claiming,
attachments, readiness validation, customer dashboard and project list.

**Done when:** a project reaches `READY` and survives a browser restart mid-wizard.

## Phase 5 — Matching and pricing ← the milestone that matters

Eligibility filters, scoring, ranking, the pricing engine, `MatchRun` persistence, results,
comparison (max 3), price band display, zero-result and price-unavailable states.

**Done when:** `GET OFFERS` returns ranked, priced manufacturers and the golden-file pricing
tests are green. **This is the first demo worth showing anyone.**

## Phase 6 — Offer request lifecycle

The state machine, consent capture, contact disclosure with its records, SLA job and
reminders, accept/decline, appointments, offers with KDV lines, accept/reject, won/lost.

**Done when:** the e2e core-flow spec passes end to end.

## Phase 7 — Communication and trust

Messaging with polling, the full notification catalogue across in-app/email/SMS, reviews with
moderation and responses, manufacturer analytics.

**Done when:** every event in `13-notifications.md` fires with a rendered `tr` template.
The gate's scope is both template families: the `Notification` catalogue
(`notification-catalog.test.ts` renders all events from the code's own closed list) **and**
the `auth.*`/verification family, which lives outside the catalogue as direct security mail
(`templates.test.ts` renders every export of `templates.ts` automatically) — the
verification email is the product's highest-volume message and a gate that skipped it would
prove less than its name.

## Phase 8 — Public site and SEO

Public homepage, category and product pages, manufacturer directory and profiles, city
landing pages, CMS with block editor, sitemaps, JSON-LD, redirects, performance budgets.

**Done when:** the five main templates meet the budgets in `18-cms-seo.md` in CI.

## Phase 9 — Hardening and launch

KVKK: export and erasure jobs, retention sweep, privacy/consent texts. Security headers, rate
limits, backup restore rehearsal, observability, load test of the matching path, launch
content (`18-cms-seo.md` §Content that has to exist), and the checklist in
`19-security-and-kvkk.md`.

**Done when:** the pre-launch checklist is fully ticked, by evidence rather than assertion.

## Dependencies worth watching

```
Phase 3 ─┐
         ├─► Phase 5 ─► Phase 6 ─► Phase 7
Phase 4 ─┘
Phase 2 ─► Phase 3
Phase 8 needs Phase 2 (catalogue) and Phase 3 (profiles) for real content
```

Phases 3 and 4 are genuinely parallel if two people are working. Nothing else is: Phase 5
needs both, and Phase 6 needs Phase 5's `MatchRun`.

## Working rules

1. **Read the two or three docs the task names, not the whole set.** `README.md` routes
   task → docs.
2. **Update `25-progress.md` after every task.** It is the only file touched by every task,
   and it is what makes the next session start informed instead of re-deriving.
3. **A doc changes before the code does.** If the implementation has to diverge, change the
   doc in the same PR and add an ADR if it was a decision (`24-decisions-log.md`).
4. **Do not build a deferred item because its screen exists.** Designs are not decisions
   (`ADR-010`).
5. **Every phase ends green.** No phase closes with a failing pipeline or a quarantined test
   without an owner.

## Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Configurator scope creep back into a rules engine | large | `ADR-008`; needs an ADR reversal to re-enter |
| Price-book data entry is too laborious for manufacturers | high — no prices, no product | simulator, clone-from-version, admin-assisted onboarding, `priceOnRequest` fallback |
| Empty marketplace at launch (no supply in a district) | high | zero-result telemetry from day one, launch city-by-city not nationwide |
| Estimate vs final offer gap erodes trust | high | band + explicit KDV labelling + the estimate shown beside the offer |
| Competitor price scraping | medium | band display, per-actor logging, rate limits, `priceOnRequest` opt-out |
| Disintermediation after disclosure | medium | on-platform tooling; the event record that a later commission model needs |
| Geocoding cost and rate limits | medium | cache table, district centroid fallback |
| KVKK gaps found late | severe | built into Phase 1 and 6, audited in Phase 9 |
