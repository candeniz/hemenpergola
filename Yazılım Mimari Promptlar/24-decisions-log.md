# 24 — Decisions Log

One entry per decision that would otherwise be re-argued. Format: context → decision →
consequences → what would reverse it. Superseding an ADR means writing a new one, not
editing the old.

---

## ADR-001 — Next.js 15 monolith with TypeScript

**Context.** Public pages need SSR for SEO (`SEO-01`); three portals need auth-gated
rendering; a mobile app follows later; the team is small.

**Decision.** One Next.js 15 App Router application in TypeScript, deployed as a single
unit, internally modular (`05-system-architecture.md`).

**Consequences.** One language, one deploy, one test pipeline. Server Components remove the
client data layer. The cost is discipline: module boundaries are enforced by lint, not by
network hops.

**Rejected.** Separate NestJS API + SPA — two deploys, two auth implementations, CORS, and
no SEO without adding SSR back. Rails/Laravel — fine frameworks, worse fit for the
SSR + typed-shared-schema requirement. Microservices — no scaling or team-size argument
exists for them here.

**Reverses if.** A second consumer needs the API before the mobile app, and the deploy
coupling actually blocks releases.

---

## ADR-002 — PostgreSQL 16 + PostGIS

**Context.** `MFR-06` allows service areas as a radius around a point, and matching must ask
"does any service area contain this project".

**Decision.** PostgreSQL with PostGIS, `geography` columns, GiST indexes, `ST_DWithin`.

**Consequences.** Real spatial queries at the DB level; no bounding-box approximations in
application code. Rules out managed Postgres offerings without PostGIS — check before
choosing a host. Also gives full-text search and `pg_trgm`, so no Elasticsearch (`ADR-004`).

**Rejected.** Haversine in application code (cannot index, N+1 over companies). MySQL
(weaker spatial and FTS). A separate geo service (a hop for one query).

---

## ADR-003 — Auth.js v5 cookies for web, Bearer JWT for `/api/v1`

**Context.** Web needs CSRF-safe server actions; mobile needs tokens.

**Decision.** Both, over one identity (`12-authentication-authorization.md`). `companyId` is
never a JWT claim; scope resolves per request from the path.

**Consequences.** `/api/v1` has no ambient authority, so CSRF cannot exist there. Membership
revocation is immediate rather than token-expiry-delayed. Cost: two auth paths to test —
covered by the authorisation matrix suite.

---

## ADR-004 — No Elasticsearch in V1

**Decision.** Postgres full-text + `pg_trgm` for manufacturer and product search.

**Consequences.** One less system to run, secure and back up. Turkish stemming is weaker
than a tuned analyzer. Acceptable at expected catalogue size; revisit when search quality is
measurably losing sessions, not before.

---

## ADR-005 — Money as integer kuruş

**Decision.** All monetary values are `Int` kuruş end to end — DB, domain, API, tests.
Formatting happens only at the render edge.

**Consequences.** No float drift, no `Decimal` serialisation ambiguity across the API. Every
division states its rounding (`08-pricing-engine.md`). A `Float` money column anywhere is a
review-blocking defect.

---

## ADR-006 — Per-manufacturer estimates, shown as a rounded band

**Context.** The brief contradicts itself: §7 describes one estimated price, §32 returns
min/max/median. And showing a per-manufacturer estimate effectively publishes each
manufacturer's price book to its competitors.

**Decision.**
1. Estimates are computed **per manufacturer** from that manufacturer's published price book
   and shown per manufacturer (`PRC-01`) — the product decision the user made.
2. The customer sees a **rounded band**, never line items (`PRC-03`).
3. The owning manufacturer sees its own full breakdown, plus a simulator against draft books.
4. Manufacturers may set `priceOnRequest` and stay matchable without displaying a price.
5. Every calculation is logged with actor and IP; rate limits apply (`06-api-specification.md`).
6. The §32 market aggregate exists **only** in the admin dashboard
   (`super_admin_market_pricing_dashboard`).

**Consequences.** Customers get a usable comparison; competitors get a noisy, rate-limited,
logged signal instead of a readable price book. The band width is an admin setting, so the
privacy/usefulness trade-off is tunable without a deploy.

**Reverses if.** Manufacturers still refuse to publish price books — then move to
band-only-on-aggregate, or manufacturer-supplied "starting from" prices.

---

## ADR-007 — Estimates exclude KDV; offers state it explicitly

**Context.** The brief mentions KDV only in the final offer (§17), never in the estimate
(§7). Silence there is a complaint generator.

**Decision.** Estimates are net of KDV and labelled as such (`PRC-05`). `Offer` carries
`netKurus`, `taxRate`, `taxKurus`, `grossKurus` as separate lines, and the offer view shows
the original estimate beside it.

**Consequences.** The estimate-to-offer gap is explained where it appears rather than in
support. Tax is computed once on the net total, never per line.

---

## ADR-008 — No configurator rules engine in V1

**Context.** Brief §27 specifies `ConfiguratorQuestion` / `ConfiguratorRule`, and a design
exists (`super_admin_configurator_builder`). It is a rules engine: conditional graphs,
compatibility constraints, answer-driven pricing.

**Decision.** V1 renders a form from `ProductAttribute` / `ProductOption` rows, plus
single-level `showIf` conditionality. The tables are modelled; the engine is not built
(`10-project-configurator.md`).

**Consequences.** Every seed product is expressible today. Admins still add products and
options without deployment (`CAT-03`). Avoids the largest scope risk in the brief. If a
product later needs true cross-option rules, this ADR gets superseded with that product as
the evidence.

---

## ADR-009 — Polling, not WebSocket, for messaging

**Decision.** `GET /offer-requests/{id}/messages?after=` at 5 s focused / 30 s background
(`15-messaging.md`).

**Consequences.** The deployment stays stateless (`23-deployment-and-environments.md`).
Latency is irrelevant for correspondence measured in hours. The API shape does not change if
the transport later does.

---

## ADR-010 — Payments, subscriptions and lead credits: modelled, not built

**Context.** Brief §37 defers payments but warns that the monetisation model shapes
`OfferRequest`. Admin screens for plans, subscriptions and invoices already exist as designs.

**Decision.** `Plan`, `Subscription`, `Payment`, `LeadCredit` ship in the schema. No service,
no route, no UI. Reserved API paths return `501`. The four admin screens are not linked.

**Consequences.** Later migrations are additive, and the events a commission or lead-credit
model would bill on (`ACCEPTED`, `contactDisclosedAt`, `OFFER_SENT`, `WON`) are already
recorded with timestamps (`11-offer-request-lifecycle.md`). Cost: four unused tables. The
rule this encodes: **a design existing is not a decision to build it.**

---

## ADR-011 — KVKK built in from Phase 1

**Context.** The brief never mentions KVKK, yet the core flow transfers a named person's
contact details to a third-party commercial entity in Turkey.

**Decision.** `Consent`, `ContactDisclosure` and `AuditLog` are core tables from the start;
disclosure is a lifecycle transition with records and notification; retention and erasure are
jobs, not manual processes (`19-security-and-kvkk.md`).

**Consequences.** Consent text is versioned in the repo and reviewed by a lawyer before
launch. Erasure is anonymisation, preserving commercial records. Retrofitting this after
launch would mean rewriting the lifecycle module and re-contacting every user.

---

## ADR-012 — Architectural Outdoor Exchange is the canonical theme

**Context.** Four themes ship in `Frontend Tasarım/`, across 77 screens, with the theme's own
prose disagreeing with its own tokens.

**Decision.** Architectural Outdoor Exchange (60 screens, every `*_final` screen). Tokens beat
prose; the `DESIGN.md` radius scale beats the screen configs; `_final` beats `_refined_style`
beats everything older (`22-design-system.md`).

**Consequences.** One token file, no runtime theme switching, no per-PR re-litigation. The 17
screens in other themes are re-tokenised when they are built, not redesigned.

---

## ADR-013 — Three wizard stages, ten logical steps

**Context.** The screens disagree: `*_step_N` screens show 10 steps,
`create_project_wizard_refined_style` shows 3.

**Decision.** Three visible stages containing ten logical steps, with per-step server
persistence (`10-project-configurator.md`).

**Consequences.** Fewer perceived steps on mobile, where drop-off happens, without losing any
field the matching and pricing engines need. Resuming works because state is in the database,
not the client.
