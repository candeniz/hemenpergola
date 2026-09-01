# 07 — Frontend Architecture

## Source of truth for the UI

`Frontend Tasarım/stitch_outdoor_architectural_marketplace/` — 77 Stitch screens, each a
folder with `code.html` (static Tailwind CDN markup) and `screen.png`. Plus four
`DESIGN.md` theme files and `project_sitemap_structure.md`.

Read them as **specification, not source**. The HTML is single-file, CDN-Tailwind,
light-mode-only, English-copy, with images pointing at expiring `googleusercontent` URLs.
Nothing there is copied into the app verbatim. What is taken: layout, hierarchy, component
inventory, states and copy intent. Token extraction is in `22-design-system.md`.

Nine `screen.png` files are placeholders containing the text `<FIFE Image failed to fetch>`
rather than an image; for those screens `code.html` is the only reference.

## Rendering strategy

| Segment | Strategy | Why |
|---|---|---|
| `(public)` · content | SSR + ISR, tag-revalidated | `SEO-01`; catalogue and profiles must be crawlable |
| `(public-owner)` | SSR, **dynamic, never cached** | `ADR-021` put the configurator here so a visitor can configure without an account. It carries personal data — dimensions, location, notes, attachments — so it is exactly as uncacheable as `(customer)`. See below |
| `(customer)` | SSR, dynamic, auth-gated by `(customer)/layout.tsx` | personal data, never cached |
| `(manufacturer)` | SSR, dynamic, auth-gated by `(manufacturer)/layout.tsx`; company scope is the services' | same |
| `(admin)` | SSR, dynamic, `noindex` | same |

### What actually keeps `(public-owner)` dynamic — three layers, found in that order

The 2026-08-24 breakage probe (Phase 8) sharpened this row. Adding `revalidate = 60` to
the group's layout did **not** flip the routes to prerendered, because every
`(public-owner)` page calls `cookies()` (the anonymous draft key) and Next puts dynamic-API
usage above any `revalidate` — the layers, outermost first:

1. the pages' `cookies()` calls force request-time rendering regardless of `revalidate`;
2. the group layout's `export const dynamic = 'force-dynamic'` states the intent;
3. `check-dynamic-routes.mjs` reads Next's own build manifests and fails the build if a
   route in the group is ever prerendered — proven to fire by manifest injection, since
   layer 1 masks the layout-level breakage today.

The order matters for the future: **the day a `(public-owner)` page stops calling
`cookies()`** — a refactor that reads the draft key some other way — layer 1 evaporates, a
parent `revalidate` becomes live, and the build check is the only guard left standing.
That is not a weakness to fix; it is why the check exists and reads the manifests rather
than the source.

### What actually enforces "auth-gated" (`ADR-024`)

A **layout per gated segment**, resolving the actor and redirecting to `/giris`. Not the
middleware: `middleware.ts` does locale negotiation only, because it runs on the edge and
authorisation needs the database (`12-authentication-authorization.md` §Authorization —
middleware authenticates and redirects, it does not authorise).

This row described a gate that did not exist from Phase 0 until Phase 4 (**Q24**). Nothing
leaked, because every page loads its data through a service that scopes by ownership or
permission, so an unauthenticated visitor met an empty shell. Task 4.8's dashboard is what
changed the arithmetic — a page that lists a customer's projects is not harmless when it
renders for anyone.

The gate is not the authorisation and must not be mistaken for it. Services remain the only
thing standing between a request and a row; the layout decides who is shown a *shell*. The
company half of `(manufacturer)` stays in the services deliberately: `resolveActor` reads
`[companyId]` from the route and `authorize()` turns a missing membership into `FORBIDDEN`,
which `02-user-roles-and-permissions.md` §Enforcement rule requires to happen in exactly one
place.

`(public-owner)` is **not** gated, and that is `ADR-021`: the configurator is public and
ownership is the project's own.

### `(public)` is not uniform — the configurator is the exception

`ADR-021` moved `/proje/yeni` and `/proje/[id]` into `(public)` so that an anonymous visitor
can configure. That makes the segment name a poor guide to caching, and the failure mode is
silent:

- `noindex` does **not** help. It turns off indexing; it says nothing about caching.
- A segment-level `revalidate` added under `(public)`, or a Phase 8 ISR sweep that treats
  `(public)` as safe by definition, would serve **one customer's project to another**.

So the split is a **route group**, `src/app/[locale]/(public-owner)/`, whose layout sets
`export const dynamic = 'force-dynamic'` for everything inside it. Parentheses keep it out of
the URL, so `/proje/yeni` is unchanged.

`scripts/check-dynamic-routes.mjs` enumerates that directory and asserts against the real
build output that every route in it is dynamic — not a list of route names, which the second
half of Phase 4 would have outgrown the moment it added `POST /claim`. Adding a route to the
group cannot forget the guarantee; adding one outside it is a statement that it carries no
personal data.

Server Components by default. `'use client'` only for: wizard step state, comparison
selection, filters, calendar, uploader, message poller, map picker. If a component does not
need an event handler or browser API, it stays a Server Component.

## Route map (`/[locale]/...`, locale ∈ `tr` | `en`)

### Public

| Route | Screen |
|---|---|
| `/` | `outdoor_systems_public_homepage_final` (canonical), `_responsive_view`, `public_homepage_tablet_view` |
| `/kategoriler`, `/kategoriler/[slug]` | `marketplace_home_refined_style` (category grid) |
| `/urunler/[slug]` | `product_detail_bioclimatic_pergola` |
| `/ureticiler` | `company_comparison_architectural_systems` (directory) |
| `/ureticiler/[slug]` | `manufacturer_profile_architectural_systems` |
| `/nasil-calisir`, `/hakkimizda`, `/iletisim`, `/fiyat-rehberi/[slug]` | CMS (`18-cms-seo.md`) |
| `/giris`, `/kayit`, `/sifre-sifirla` | `login_outdoor_systems`, `register_outdoor_systems`, `forgot_password_outdoor_systems` |
| `/sifre-yenile?token=` | the reset-completion step; no Stitch screen, composed from the same card |
| `/eposta-dogrula?token=`, `/telefon-dogrula` | `email_verification_outdoor_systems`, `phone_verification_outdoor_systems` |
| `/proje/yeni`, `/proje/[id]` (3 stages, 10 steps) | `create_project_wizard_refined_style` (canonical), `product_selection_step_1`, `dimensions_area_step_2`, `project_options_step_5`, `project_summary_step_10` — **public by `ADR-021`**: a visitor configures without an account and the wall stands at "get offers" (`10` §Anonymous drafts) |
| `/yetkisiz` | `access_denied_permission_required` as a landable route — see §System states |

Turkish slugs are the canonical public URLs; `en` uses its own slug set. Slug per locale is
stored, not translated at runtime — on the translation row, with uniqueness per
`(locale, slug)` (`ADR-017`, which resolves this against `04` §Catalogue).

**Locale is decided by the path, never by the browser** (`ADR-018`). `localeDetection` is
off: `/` and every unprefixed route is Turkish for everybody, and `en` is an explicit choice
that the `NEXT_LOCALE` cookie then remembers. next-intl negotiates on `Accept-Language` by
default, which sent every English-configured browser — common in this audience — to the
English site from a Turkish URL, and made an unprefixed path mean two different pages to two
different crawlers.

The four auth routes above are the ones Phase 1 built. Two differ from this table's first
draft (`/sifre-sifirla` rather than `/sifremi-unuttum`; flat `/eposta-dogrula` rather than
`/dogrulama/email`) and two were missing from it entirely — the reset-completion step and a
landable 403. The table is corrected to what exists rather than the routes being renamed:
the names are equally arbitrary, and the omissions were the real defect.

### Customer

| Route | Screen |
|---|---|
| `/hesap` | `customer_dashboard_final` (canonical), `_empty_state`, `_tablet_view`, earlier: `customer_dashboard`, `customer_dashboard_outdoor_systems` |
| `/hesap/projeler` | the customer’s own list (`customer_dashboard_final`) |
| `/hesap/projeler/[id]` | `request_detail_project_aoe_99421` |
| `/hesap/projeler/[id]/eslesmeler` | `matched_manufacturers_results`, `offer_results_refined_comparison`; loading: `finding_manufacturers_loading_state`, `offer_results_loading_state` |
| `/hesap/projeler/[id]/karsilastir` | `compare_manufacturers_refined_style` (canonical), `compare_manufacturers` |
| `/hesap/projeler/[id]/talep` | `manufacturer_selection_confirmation` → `request_success_confirmation` |
| `/hesap/talepler`, `/hesap/talepler/[id]` | `offer_request_form_arte_outdoor` |
| `/hesap/mesajlar/[requestId]` | `customer_messages_arte_outdoor` |
| `/hesap/kayitli-firmalar` | `saved_companies_outdoor_systems` |
| `/hesap/ayarlar` | — (compose from settings patterns) |

### Manufacturer (`/panel/[companyId]/...`)

| Route | Screen |
|---|---|
| `/` | `manufacturer_portal_dashboard_final` (canonical); earlier `manufacturer_admin_dashboard`, `manufacturer_dashboard_arte_outdoor`, `_refined_style`, `_tablet_view` |
| `/talepler`, `/talepler/[id]` | `offer_requests_manufacturer_portal`, `manufacturer_request_detail_new_lead` (pre-accept), `manufacturer_request_detail` (post-accept) |
| `/takvim`, `/randevular/[id]` | `manufacturer_project_calendar`, `manufacturer_appointment_detail` |
| `/urunler` | `manufacturer_product_management` |
| `/fiyatlandirma` | `manufacturer_pricing_management` |
| `/hizmet-bolgeleri` | `manufacturer_service_area_management` |
| `/portfoy` | `manufacturer_portfolio_management` |
| `/yorumlar` | `manufacturer_reviews_management` — built as `yorumlar`, not `degerlendirmeler`; the nav pointed at the latter until 14.2 |
| `/ekip` | `manufacturer_team_management` |
| `/analitik` | `manufacturer_performance_analytics` |
| `/ayarlar` | `manufacturer_company_settings` |

The two request-detail screens are the **same route in two states**, split by
`contactDisclosedAt`. Do not build two pages; build one page with a disclosure boundary.

### Admin (`/yonetim/...`)

| Route | Screen |
|---|---|
| `/` | `super_admin_command_center_final` (canonical), `super_admin_global_dashboard` |
| `/ureticiler`, `/ureticiler/[id]` | `super_admin_manufacturer_management`, `super_admin_manufacturer_verification`, `super_admin_manufacturer_verification_detail` |
| `/musteriler`, `/musteriler/[id]` | `super_admin_customer_management`, `super_admin_customer_detail_profile` |
| `/talepler` | `super_admin_offer_request_management` |
| `/katalog` | `super_admin_product_catalog_management` |
| `/yorumlar`, `/sikayetler` | `super_admin_reviews_moderation`, `super_admin_complaints_disputes` — moderation shipped as `yorumlar` (14.2) |
| `/icerik` | `super_admin_cms_seo_management` — shipped as `icerik` (14.2) |
| `/bildirimler` | `super_admin_global_notification_settings` |
| `/denetim` | `super_admin_audit_logs` |
| `/metrikler` | `super_admin_platform_metrics_analytics` |
| `/pazar-fiyatlari` | `super_admin_market_pricing_dashboard` — **admin-only aggregate** (`ADR-006`) |
| `/ayarlar` | platform settings (`ADM-06`) — no Stitch screen; `17` §Platform settings is the spec |

### Deferred screens — do not build (`ADR-010`)

`super_admin_plan_management`, `super_admin_subscriptions_oversight`,
`super_admin_invoices_transactions`, `super_admin_configurator_builder`. Designs exist;
features do not. Leave them out of the navigation entirely rather than shipping dead links.

### Out of the navigation until they are built (task 13.8)

The rule above was broken for a year in a quieter way: **eleven links pointed at pages
nobody had built**, and a link to a 404 is the same promise as a disabled link, only louder.
`nav-items.test.ts` now resolves every href against `src/app`, so this cannot recur silently.

They are out of the navigation and come back one at a time, each with its page. The reason
differs and the difference is what decides the order:

| Route | Screen | Why not yet |
|---|---|---|
| `/panel/[id]/ekip` | `manufacturer_team_management` | **Nothing missing but the page.** `listMembers`, `inviteMember`, `changeMemberRole`, `removeMember` all exist. First in line |
| `/hesap/talepler` | `offer_request_form_arte_outdoor` | Requests are listed per project (`listRequestsForProject`); a cross-project list is a new service method |
| `/hesap/mesajlar` | `customer_messages_arte_outdoor` | Same shape: threads exist per request, an inbox does not |
| `/yonetim/musteriler` | `super_admin_customer_management` | No admin customer-list service; `19` §Data minimisation makes what it may show a decision, not a query |
| `/hesap/ayarlar` | — (compose from settings patterns) | Profile and locale writes are named in `06` §Auth and not built (Phase 10.4) |
| `/hesap/kayitli-firmalar` | `saved_companies_outdoor_systems` | **No `SavedCompany` table.** A feature, not a page |
| `/yonetim/sikayetler` | `super_admin_complaints_disputes` | **No `Complaint` table.** Same |
| `/panel/[id]/analitik` | `manufacturer_performance_analytics` | The aggregates it shows — response time, win rate, views — are not computed. `Company` carries denormalised review ratings and nothing else |
| `/yonetim/metrikler` | `super_admin_platform_metrics_analytics` | Same: `dashboardCounts` answers "what is waiting now", not a time series |
| `/yonetim/pazar-fiyatlari` | `super_admin_market_pricing_dashboard` | No aggregate behind it, and `ADR-006` makes what may be aggregated a decision |
| `/yonetim/bildirimler` | `super_admin_global_notification_settings` | **Redundant.** `/yonetim/ayarlar` is the `PlatformSetting` surface and already holds these values |

`25-progress.md` §Open questions carries the same list with a phase and an owner.

### System states

`access_denied_permission_required` → `app/[locale]/forbidden.tsx` and the 403 boundary.
`system_error_price_unavailable` → the pricing-failure state inside the matches page, not a
separate route (`03-user-flows.md` §Failure paths).

## Component layers

```
src/components/
  ui/          shadcn/ui primitives, tokenised to the theme (22-design-system.md)
  patterns/    ProjectCard, ManufacturerCard, EstimateBand, StatusBadge, StepHeader,
               ComparisonTable, DataTable, EmptyState, FileDropzone, ConsentCheckbox
  layouts/     PublicShell, DashboardShell, PortalShell, AdminShell
```

`patterns/` is where the Stitch screens are actually consumed: each screen decomposes into
patterns, and a second screen reusing the same pattern must not fork it. Rule: a third
occurrence of the same markup becomes a pattern component in the same PR.

Density differs by shell, deliberately: `PublicShell` uses the 48/80 px rhythm,
`PortalShell` and `AdminShell` use the 8/12 px high-density scale. Same tokens, different
scale selection — see `22-design-system.md` §Density.

## Forms and data flow

- One Zod schema per use case in `modules/*/application/dto`, imported by both the server
  action and the client form. No duplicated client-side validation rules.
- `useActionState` + server actions; no client data-fetching library in V1.
- The wizard persists on each step (`PATCH /projects/{id}`), so state lives in the DB, not in
  a client store. Client state holds only the current step and unsaved field values.
- Optimistic UI only for message send and save/unsave company. Anything money- or
  status-bearing waits for the server.

## i18n

`next-intl`, locales `tr` (default) and `en`, catalogues in `src/i18n/messages/{locale}.json`
namespaced by module. `I18N-01`: no hardcoded user-facing string. The Stitch screens are in
English — their copy is the source for `en.json`, and `tr.json` is authored, not
machine-translated, because pricing and legal wording carries KVKK weight.

Formatting: `Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })` over
kuruş ÷ 100 at the edge only. Dates in `Europe/Istanbul` for display, UTC in the DB.

## Accessibility and responsive

The screens supply tablet variants for the three dashboards and the homepage; mobile is
derived, not designed. Breakpoints follow the design system (600/900/1200). Non-negotiables:
visible focus rings, real `<label>` associations, 44 px touch targets, AA contrast on the
deep-slate-on-light palette, keyboard-navigable wizard and comparison table, and
`prefers-reduced-motion` respected. The screens ship `class="light"` only — dark mode is
out of scope for V1 and tokens are structured so it stays addable later.
