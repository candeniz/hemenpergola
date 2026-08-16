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
| `(customer)` | SSR, dynamic, auth-gated | personal data, never cached |
| `(manufacturer)` | SSR, dynamic, auth + company-scoped | same |
| `(admin)` | SSR, dynamic, `noindex` | same |

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
| `/degerlendirmeler` | `manufacturer_reviews_management` |
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
| `/degerlendirmeler`, `/sikayetler` | `super_admin_reviews_moderation`, `super_admin_complaints_disputes` |
| `/cms` | `super_admin_cms_seo_management` |
| `/bildirimler` | `super_admin_global_notification_settings` |
| `/denetim` | `super_admin_audit_logs` |
| `/metrikler` | `super_admin_platform_metrics_analytics` |
| `/pazar-fiyatlari` | `super_admin_market_pricing_dashboard` — **admin-only aggregate** (`ADR-006`) |
| `/ayarlar` | platform settings (`ADM-06`) — no Stitch screen; `17` §Platform settings is the spec |

### Deferred screens — do not build (`ADR-010`)

`super_admin_plan_management`, `super_admin_subscriptions_oversight`,
`super_admin_invoices_transactions`, `super_admin_configurator_builder`. Designs exist;
features do not. Leave them out of the navigation entirely rather than shipping dead links.

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
