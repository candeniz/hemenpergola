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

> **Superseded in part by `ADR-022`.** The `/api/v1` half stands. The web half does not:
> Auth.js's Credentials provider supports only JWT sessions, which cannot deliver the
> immediate revocation this ADR promises below. Left unedited on purpose — a decision log
> rewritten to match what happened later stops being evidence.

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

**Amended 2026-08-16, task 2.1.** This decision rests on `showIfAttributeKey` +
`showIfValue`, which `10-project-configurator.md` §What V1 builds describes and
`04-data-model.md` §Catalogue omitted from `ProductAttribute`. Writing migration 3 surfaced
the gap. No decision changed — the columns were always what "single-level conditionality"
meant — so this is an amendment rather than a new ADR: the columns are in the schema and `04`
is corrected. Worth recording because the omission was load-bearing: without those columns
the only way to express "show the motor brand when motorised is true" is the rules engine
this ADR declines to build.

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

---

## ADR-014 — One migration per phase; the deferred tables ship in migration 1

**Context.** `26-execution-plan.md` §Phase 0 proposed a migration granularity and asked for
an ADR if it was adopted. It is.

Two questions were open. How finely should migrations be cut — per table, per PR, per
phase? And when do the `ADR-010` tables (`Plan`, `Subscription`, `Payment`, `LeadCredit`,
`ConfiguratorQuestion`, `ConfiguratorRule`) enter the schema, given they have no service, no
route and no UI in V1?

**Decision.**

1. **One migration per phase, named for it.** Migration 1 is `phase0_foundation`.
2. **The deferred tables ship in migration 1** and are never touched again.

**Consequences.**

A phase-sized migration is reviewable as a unit and matches how the work is planned, so
"what does this phase change in the database" has a single answer. It also matches
`23-deployment-and-environments.md` §Migrations: expand → migrate → contract *within* a
release, which is easier to hold when a release is a phase.

Shipping the deferred tables now is the whole point of modelling them. Later migrations stay
additive, and — the part that matters — nobody re-litigates `ADR-010` in Phase 7 because the
tables are already there and visibly unused. The cost is six tables that no code touches.

Migration 1's scope, from `04-data-model.md`: the PostGIS and `pg_trgm` extensions, the
Auth.js v5 tables, §Identity and tenancy in full, `City`/`District`, `PlatformSetting`,
`AuditLog`, `Consent`, `File`, and §Deferred in full. Catalogue, project, pricing, matching,
offer, messaging, review and content tables are **not** in it; they arrive with their phases.

**Reverses if.** A phase turns out to need a destructive change mid-flight and cannot wait
for the next one. That is a reason to cut a second migration inside the phase, not to
abandon the granularity.

---

## ADR-015 — PostGIS lives behind `src/shared/geo`, not in the modules

**Context.** `ADR-002` requires real spatial queries at the database level. Prisma has no
`geography` type, so those columns cannot be expressed in the schema or queried through the
client — they need `$queryRaw`. The question is where that raw SQL is allowed to live.

**Decision.** Spatial columns are `Unsupported("geography(Point, 4326)")` in
`prisma/schema.prisma`; their GiST indexes are hand-written in the migration; and **every
spatial read and write goes through `src/shared/geo`**, which is the only file in the
application permitted to write PostGIS SQL.

**Consequences.**

`ADR-002`'s real rule — *no Haversine in application code* — becomes structural rather than
cultural. A developer who needs a distance finds a function that already exists and uses the
index; the alternative is writing raw SQL in a module, which is visible in review precisely
because nothing else does it.

`shared/geo` also owns the two things that are easy to get wrong once and then copy:
`ST_MakePoint` takes **(longitude, latitude)**, the reverse of how it is spoken, and
`geography` distances are metres while service areas are configured in kilometres.

The cost is that spatial columns are invisible to the Prisma client, so they cannot be
selected, filtered or included through it. Phase 3 follows the same pattern when
`ServiceArea.centerPoint` arrives: `Unsupported` column, GiST index in the migration,
containment query as a function in `shared/geo`.

---

## ADR-016 — Member management is onboarding work, and reading the roster is a read

**Context.** `02-user-roles-and-permissions.md` §Verification state summarises `PENDING` as
*"can complete profile and upload documents"*. Task 1.6 turned that summary into code, and two
consequences fell out that nobody had decided.

The first: with `member.invite`, `member.remove` and `member.change_role` classified as
`write`, a company that has just registered is **one person** until an administrator verifies
it. The founder must personally scan the tax certificate, upload it, and answer any question
about it. In a real firm the person who registers the company is rarely the person who does
the paperwork, and there is no way to hand it over. That is a verification queue designed to
be slow.

The second: `02`'s catalogue has no permission for *reading* the roster. Task 1.6 needed one
and used `member.invite`, which means a `SALES` user cannot see who else is in the company
they work for — they can answer a customer request but not find the colleague to hand it to.
This is the same omission as `document.upload`, which `02`'s prose implies and its table left
out.

**Decision.**

`member.invite`, `member.remove` and `member.change_role` are **`onboarding`**, not `write`.
A `PENDING` company may build its team, because building the team is part of the work that
gets it verified.

A new permission **`company:member.read`** is added, classified `read`, held by all four
company roles. `listMembers` uses it.

`02` §Verification state is corrected: the `PENDING` row now reads *"can complete profile,
manage members and upload documents"*.

**Consequences.**

`REJECTED` and `SUSPENDED` are untouched. Neither permits onboarding work, so a frozen or
rejected company still cannot change who its members are — which is the property that
mattered, and it is now enforced by the `PermissionKind` table rather than by three
permissions happening to be classified `write` for an unrelated reason.

A `PENDING` company can now invite people into a company that is not yet verified. That is
not a new exposure: every operational permission is still `write`, so an invited member of a
pending company can do exactly what the founder can — onboarding work and reads.

`member.read` makes the roster visible to `VIEWER`. The roster is names, email addresses and
roles of colleagues, which every member of a company already knows; it is not customer data
and `19-security-and-kvkk.md` §Contact disclosure does not reach it.

The precedent worth naming: **the catalogue in code is the source of truth, and `02`'s table
is generated from it** (`scripts/generate-permission-table.mjs`). When the two disagree the
resolution is a decision recorded here plus a regenerated table — not a comment in the
service explaining why the code differs from the document.

---

## ADR-017 — Slugs are per locale, and they live on the translation row

**Context.** Two documents disagreed, and Phase 2 writes the schema that settles it.

`04-data-model.md` §Catalogue declared `Category(slug unique)` and `Product(slug unique)` —
one slug per entity. `07-frontend-architecture.md` §Route map declared the opposite:
*"Turkish slugs are the canonical public URLs; `en` uses its own slug set. Slug per locale is
stored on the entity, not translated at runtime."*

Both cannot be true. `/urunler/bioklimatik-pergola` and `/en/products/bioclimatic-pergola` are
the same product, and `18-cms-seo.md` builds `hreflang` pairs and canonical URLs out of them.
A single slug means the English URL carries a Turkish word, which is the one thing an SEO
document exists to prevent.

**Decision.** `07` wins. There is no `slug` column on `Category` or `Product`. The slug is a
column on `CategoryTranslation` / `ProductTranslation`, with `@@unique([locale, slug])`.

**Consequences.**

Uniqueness is per locale, which is what it should be: nothing stops a Turkish slug and an
English slug from being the same string when the word is the same, and nothing allows two
Turkish products to collide.

`07`'s wording — *"stored on the entity"* — also permits a second reading: `slugTr` and
`slugEn` columns on `Category` itself. That is rejected. It makes a third locale a migration
rather than a row, it duplicates the uniqueness constraint per column, and it puts locale
knowledge in the entity table, which is exactly what a translation table is for.

The cost is that resolving a public URL is a join, and that every lookup must carry a locale.
That is not incidental — a slug without a locale is ambiguous, and the type system now says
so. `04` §Catalogue is corrected accordingly.

**Scope.** This is not a rule about the catalogue; it is a rule about **every table with a
public URL**. That is `Category`, `Product` and `CmsPage`. `04` §Content still had
`CmsPage(slug unique)` when this ADR was written, which is the same contradiction one table
further along — `07` §Route map gives the CMS pages Turkish canonical URLs and an English set
beside them. It was corrected in Phase 2, while `CmsPage` is still a line in a document.
After Phase 8 it would be a migration over live content with indexed URLs hanging off it, and
the redirect map to go with it.

Anything added later with a public URL inherits the same shape: no `slug` on the entity, a
`slug` on the translation row, `@@unique([locale, slug])`.

**Reverses if.** A product ever needs one canonical URL across locales, which would be a
decision about `18`, not about this table.

---

## ADR-018 — Turkish is the default locale unconditionally; no `Accept-Language` negotiation

**Context.** `07-frontend-architecture.md` §i18n says *"Turkish is the default locale and the
root URL path"*, and `localePrefix: 'as-needed'` implements that: `/kayit` is Turkish,
`/en/kayit` is English.

next-intl also negotiates on `Accept-Language` by default, and that quietly overrides the
first rule. A visitor whose browser announces `en-US` asking for `/kayit` is redirected to
`/en/kayit`. Phase 1's own end-to-end suite hit this: Playwright's Chromium requests
`en-US`, and every assertion about a Turkish page failed against an English one.

An English-configured browser is common among the target audience — developers, designers,
anyone who bought a laptop with an English image, and a large share of professional users in
Turkey generally. So the negotiation sends a substantial fraction of Turkish users to the
English site by default, on a Turkish marketplace, and the only way back is a language switch
they have to notice.

**Decision.** `localeDetection: false`. `/` and every unprefixed path is Turkish, always.
English is reached by an explicit `/en` prefix — a link, a bookmark, or the locale switcher,
which persists the choice in the `NEXT_LOCALE` cookie.

**Consequences.**

The default is now a property of the URL rather than of the visitor's browser configuration,
which makes it cacheable and makes a canonical URL canonical: `18-cms-seo.md` builds
`hreflang` pairs on the assumption that a path maps to one locale, and a negotiated redirect
on the unprefixed path breaks that for crawlers as well as for people.

A genuine English speaker landing on `/` now sees Turkish until they use the switcher. That is
the trade, and it is the right way round: a Turkish user shown Turkish has lost nothing, and
an English user shown Turkish is one click from English. The reverse — a Turkish user shown
English — costs a page they may simply leave.

`localeDetection: false` does not disable the cookie. A visitor who switches to English stays
in English on their next visit, because that is a choice they made rather than a header their
browser sent.

**Reverses if.** Analytics show meaningful non-Turkish traffic arriving on unprefixed paths
and bouncing. The fix then is a dismissible banner offering the other locale, not an automatic
redirect.

---

## ADR-019 — No geocoding provider in V1; administrative centroids and an optional pin

**Context.** `26-execution-plan.md` §Decision calendar put Q4 — *"geocoding provider and
budget"* — at the start of Phase 3, because `ServiceArea` with `kind = RADIUS` needs a
`centerPoint` and something has to produce one. Two routes were on the table:

- a **map picker**, where the manufacturer drags a pin and no geocoding happens at all; the
  cost is a map-tile vendor decision — licence, per-view pricing, and a third party
  receiving the location of every Turkish manufacturer on the platform;
- a **geocoding provider** behind the `Geocoder` port, where an address is typed and
  resolved; the cost is per-request pricing, a rate limit, a cache table, and addresses
  leaving the country.

**Decision.** Neither, for now. The `Geocoder` port ships with an
**administrative-centroid adapter**: it resolves a city and district to the centroid Phase 0
already seeded — 81 provinces and 974 districts, offline and free — and a manufacturer who
knows their coordinates can enter them directly, which is stored as `precision: 'exact'`.

Q4 is therefore **narrowed, not closed**: the question is no longer "which provider and what
budget" but "does the public site need map tiles in Phase 8, and if it does, does the picker
come free with them".

**Why this is not a fudge.**

A radius service area says *"we work within N kilometres of here"*. The uncertainty that
dominates is N — a manufacturer picks 30 or 50, never 32.4 — and on the *other* side of the
comparison `09-manufacturer-matching.md` §Service-area coverage already accepts a district
centroid as the project's point when the customer gave no precise location, calling it *"good
enough for a radius test"*. Paying a provider to place one end of that comparison to within
ten metres while the other end is the middle of a district buys nothing that anybody can
measure.

The largest district in Turkey is tens of kilometres across, so the worst case is real; it is
also bounded, visible, and fixed by the manufacturer entering coordinates. What it is not is
a reason to take on a vendor before a single manufacturer has drawn a service area.

**Scope of this argument: containment, not ranking.**

The reasoning above holds for *"is this project inside this service area?"* because
`ST_DWithin` returns a boolean — an error of a few kilometres against a radius a manufacturer
chose in multiples of ten changes the answer only for projects sitting almost exactly on the
edge.

It does **not** automatically hold for scoring. `09-manufacturer-matching.md` §Scoring gives
proximity 25 points out of 100 and derives them from the distance normalised over the radius —
a *continuous* function of the same number. There, a district-centroid error is not rounded
away by a threshold; it moves the score, and with it the order manufacturers appear in.

Read as written before this paragraph, someone would conclude "precision does not matter",
which is half true and is the more expensive half to get wrong. **Whether centroid-grade
precision is good enough for the proximity score is an open question owned by Phase 5** —
Q22 in `25-progress.md`. If the answer is no, the options are ranking proximity in bands
rather than continuously, or resolving an exact point for scored projects only.

**Consequences.**

Phase 3 waits on no procurement decision, which was the point of putting Q4 in the calendar.

The port is real and the adapter is one file, so the day street-level accuracy is needed
nothing else changes. The adapter is called `administrativeGeocoder` rather than
`nullGeocoder` on purpose: it is a real geocoder with a coarse resolution, and naming it after
what it lacks would invite somebody to replace it before finding out whether the resolution is
a problem.

`GeocodeResult.precision` is stored and shown, because a radius drawn around a district
centroid is a different promise from one drawn around a pin, and the manufacturer should be
able to tell which they have.

Resolution happens in the **`geo.geocode_service_area` job**, not in the request. That is one
more moving part than an inline call, and it is what makes a better geocoder a bulk re-run
over existing rows rather than a migration.

**Reverses if.** Matching quality complaints trace to service-area precision, or Phase 8
brings map tiles for the public directory anyway — at which point the picker is nearly free
and the argument above stops applying.

---

## ADR-020 — Monotonicity is a property of a price book, not of the engine

**Context.** `20-testing-strategy.md` §Unit asks for a property test: *"net is monotonic in
area."* Written as stated it fails, and it fails on a configuration the engine is handling
correctly:

    base ₺100/m², AREA_DISCOUNT of 10% at area ≥ 100
      99 m² → ₺9 900
     100 m² → ₺10 000 − 10% = ₺9 000

A threshold discount can make a larger project cost less in total. Three ways out were on the
table: drop threshold rules; make discounts apply only to the marginal amount above the
threshold; or scope the property.

**Decision.** Scope the property, and add a diagnostic.

- The engine property test asserts monotonicity over **rule-free** books, where it is an
  arithmetic fact: base, options and a regional percentage all scale or stay flat.
- `inspectPriceBook` sweeps a book across basis values and reports an inversion as a
  **warning to its owner**, surfaced in the simulator panel before publishing.
- A second property — *the band always contains the net* — is asserted universally, because
  it genuinely is.

**Why not the alternatives.** Dropping threshold rules removes a feature every manufacturer in
the design uses. Marginal-only discounts ("10% off the area above 100 m²") preserve
monotonicity and are what a pricing theorist would choose — but they are not what
`08-pricing-engine.md` §Algorithm describes, they are harder to explain on the screen, and
picking them here would mean the engine quietly disagreeing with the specification. If the D3
pilot says manufacturers think marginally, that is an ADR of its own with the evidence
attached.

**Consequences.** The manufacturer is told, in their own screen, that their 100 m² price is
below their 99 m² price — which is a better outcome than a rule that silently prevented them
from expressing it, and a far better one than a customer discovering it. `20` §Unit's line is
now more specific than it was; the test file says why in full.

**Reverses if.** The pilot shows manufacturers reliably create inverting books and ignore the
warning. Then marginal-band discounts become the model and `08` §Algorithm changes with an
`ENGINE_VERSION` bump.

---

## ADR-021 — The configurator is a public route; the account wall stands at "get offers"

**Context.** Two documents contradicted each other and both were load-bearing.

`07-frontend-architecture.md` §Route map put the wizard at `/hesap/projeler/yeni`, and
§Rendering strategy defines the `(customer)` segment as *"SSR, dynamic, **auth-gated**"*.
`10-project-configurator.md` §Anonymous drafts says *"A visitor can configure without an
account"*, and puts the wall between *configure* and *get offers* — deliberately, because that
is the point in the funnel where intent is highest.

Both cannot hold. Under an auth-gated segment an anonymous visitor cannot reach the wizard at
all, and task 4.5 would have to move it — a **public URL change in the same phase**, which
`18-cms-seo.md` §URLs treats as a cost rather than a detail.

**Decision.** The wizard moves to a public path.

| Route | Segment | Auth |
|---|---|---|
| `/proje/yeni` | `(public)` | none — creates a draft and redirects |
| `/proje/[id]` | `(public)` | none — ownership is the project's own, by session **or** anonymous key |
| `/hesap/projeler`, `/hesap/projeler/[id]` | `(customer)` | auth-gated, unchanged |

Route segments stay Turkish under both locales (`/en/proje/yeni`), as every other segment
does; `ADR-017`'s per-locale slug sets are for **content** slugs — categories, products, CMS
pages — not for route segments. `ADR-018` keeps `tr` unprefixed.

**Why not keep the URL and exempt it from the gate.** A path under `/hesap` that does not
require an account lies twice: to a reader who infers the rule from the segment, and to the
middleware matcher, which would need a carve-out that every later change has to preserve. The
segment name is the documentation; an exception inside it makes the name false.

**Consequences.**

- The funnel matches the routing: configuring is public, and the wall is where `10` wants it.
- 4.5 adds anonymous drafts **without moving a URL**, because the URL is already public.
- `/proje/[id]` is not auth-gated, so authorisation is entirely the project's own ownership —
  `customerId` **or** `anonymousKey`, in the `where` clause, answering `NOT_FOUND` to anyone
  else. That is the shape `registry.ts`'s `customer-owned` variant was built for.
- The page is `noindex`: it is a form, not content, and `SEO-01` wants the catalogue crawled,
  not draft configurations.

**Reverses if.** Anonymous drafts are dropped from V1 entirely. Then the wizard can move back
under `(customer)` and the wall moves up the funnel — which is a product decision, not a
routing one.

---

## ADR-022 — Server-side sessions for web, overriding `ADR-003`'s web half

**This is the first ADR that overrides another.** `ADR-003` stands for `/api/v1`; its web
half is withdrawn. The reasoning is recorded at length because a superseded decision that
nobody can re-derive is worse than the original mistake.

**Context.** Phase 4 is the first feature needing an authenticated *browser* session, and
found there was none. The sign-in form validated credentials, rendered a tick, and discarded
the tokens `loginAction` returned; nothing in the codebase ever wrote a session cookie, while
`identify.ts` read one. Every authenticated test to date drove `/api/v1` with a Bearer token,
so nothing caught it.

That gap was a **deliberate Phase 1 deferral** — "Auth.js wiring deferred; no screen required
it" — recorded in the progress log and *not* in §Open questions. The log is 130 KB; the
question table is where deferrals stay visible. See `CLAUDE.md` §Definition of done, which now
requires the table entry, and **Q23**.

**The constraint that decided it.** Auth.js v5's Credentials provider supports **only the JWT
session strategy**. Database sessions with credentials require manually creating rows inside
the `jwt` callback — fighting the framework rather than using it.

That makes `ADR-003` internally inconsistent. Its own stated consequence is *"membership
revocation is immediate rather than token-expiry-delayed"*, and a stateless JWT cookie cannot
deliver that. Nor can it deliver the rest of `12` §Sessions and revocation:

| `12` requires | Stateless JWT cookie |
|---|---|
| list sessions with device and IP | nothing to list |
| revoke one session | cannot; the token stays valid until it expires |
| revoke all others on password change | same |
| membership change effective on the next request | only after the token expires |

`Session(id, sessionToken, userId, expires)` has been in migration 1 since Phase 0, unused.

**Decision.** For web: a **server-side session row plus an opaque httpOnly cookie** carrying
only its id. `/api/v1` keeps Bearer JWTs exactly as `ADR-003` specified — that half was never
in question, and mobile genuinely wants stateless tokens.

Auth.js is not added as a dependency. It was never installed; adding it to obtain a mechanism
weaker than the one already modelled would be cost without benefit.

**Why not keep `ADR-003` and accept JWT cookies for web.** Because `12` is the more concrete
document, and the four rows above are not decoration — session revocation on password change
is a security control, and "your other devices are signed out" is a promise the reset screen
already makes. An architecture note cannot outrank a security requirement it cannot satisfy.

**Consequences.**

- Two session mechanisms, as before, but now genuinely different: opaque and revocable for
  web, stateless for the API. The authorisation-matrix suite already covers both paths.
- A database read per authenticated web request. The `Session` lookup is a single indexed
  query on a unique column, which is the cost `12` §Sessions was written knowing.
- CSRF: the cookie is `httpOnly`, `SameSite=Lax`, `Secure` outside development. Server actions
  are same-origin by construction.
- `ADR-003`'s title now reads as half-true. It is left in place with a pointer here rather
  than edited, because rewriting a decision to match what happened later is how a decision log
  stops being evidence.

**Reverses if.** The session lookup ever shows up in a latency budget, at which point the
answer is a cache in front of the row — not a stateless token, which would give the revocation
problem back.
