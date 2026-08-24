# 18 — CMS & SEO

Organic search is the acquisition channel for a marketplace like this. `SEO-01` is why the
stack is server-rendered (`ADR-001`); this document is what that decision has to deliver.

## URL structure

```
/                                     home (tr)
/en                                   home (en)
/kategoriler/[categorySlug]
/urunler/[productSlug]
/ureticiler                           directory, filterable
/ureticiler/[companySlug]
/ureticiler/[companySlug]/portfoy
/[city]/[productSlug]                 location landing pages
/fiyat-rehberi/[slug]                 price guides (CMS)
/nasil-calisir, /hakkimizda, /iletisim, /sss   (CMS)
```

Rules:

- Slugs are per-locale and stored on the entity, never machine-translated at runtime.
- `tr` is the default locale and serves at the root; `en` is prefixed. Both carry
  `hreflang` pairs plus `x-default`.
- Slugs are immutable once indexed. A change writes a `SlugRedirect` row and the old slug
  answers with a **308** (permanent-redirect class) to the current one; the old slug never
  returns a 404. 308 rather than 301 (updated 2026-08-24 to match the build): both are the
  permanent class search engines transfer ranking through, 308 additionally guarantees the
  method is preserved, and it is what Next's `permanentRedirect` emits — documenting 301
  while shipping 308 would make this rule unverifiable against the running site.
- Filters use query parameters and are `noindex, follow`, except the curated
  `/[city]/[productSlug]` landing pages, which are real indexable pages with their own
  content and SEO record.
- Lowercase, hyphenated, Turkish characters transliterated (`ısı` → `isi`), no trailing
  slash, canonical always absolute.

## Metadata

Every indexable entity has an `Seo` row (`04-data-model.md`) used by Next's `generateMetadata`:
title, description, canonical, OG image, `noIndex`, JSON-LD. Fallback chain: explicit `Seo`
row → generated template → entity name. Empty meta descriptions never ship.

Title templates:

| Page | Template |
|---|---|
| Product | `{product} Fiyatları ve Üreticileri \| {brand}` |
| Category | `{category} Sistemleri \| {brand}` |
| Manufacturer | `{company} — {city} {mainProduct} Üreticisi \| {brand}` |
| City landing | `{city} {product} Fiyatları ve Firmaları \| {brand}` |

## Structured data

| Page | Types |
|---|---|
| Manufacturer profile | `LocalBusiness` + `AggregateRating` (only from 3 reviews) + `Review` |
| Product | `Product` + `Offer` with `priceRange` from published estimates |
| Price guide / article | `Article` + `BreadcrumbList` |
| FAQ pages | `FAQPage` |
| All | `BreadcrumbList`, `Organization`, `WebSite` + `SearchAction` |

`Product.Offer.priceRange` uses the **band** aggregate across manufacturers, never a
per-manufacturer figure (`PRC-03`, `ADR-006`). Markup must match what a visitor sees, or it
is a manual-action risk.

## Rendering and caching

- Public pages: static where possible, ISR otherwise, revalidated by tag on publish
  (`category:{id}`, `product:{id}`, `company:{slug}`, `cms:{slug}`).
- Manufacturer profiles revalidate on profile, portfolio and review changes.
- `sitemap.xml` is generated per section (static, categories, products, manufacturers, city
  landings, CMS) with an index; `lastmod` comes from the entity.
- `robots.txt` allows public sections and disallows `/hesap`, `/panel`, `/yonetim`, `/api`.
  Staging returns `Disallow: /` for everything — a staging site in the index costs more than
  it looks like it should.

## CMS

`CmsPage` + `CmsPageTranslation` + `Seo`, edited in `super_admin_cms_seo_management`.
Block-based body (heading, rich text, image, FAQ, CTA, table), stored as validated JSON, not
raw HTML. Rendering raw editor HTML is a stored-XSS hole and a layout-drift generator.

Draft → preview via a signed token → publish, with revision history and rollback.

## Performance budgets

Core Web Vitals are ranking inputs and the public pages are image-heavy:

| Metric | Budget |
|---|---|
| LCP | ≤ 2.0 s mobile |
| INP | ≤ 200 ms (lab proxy in CI: TBT ≤ 200 ms — INP needs field interaction data no lab run has) |
| CLS | ≤ 0.1 |
| TTFB (ISR hit) | ≤ 400 ms |

**Measurement conditions** (added 2026-08-24 — a budget without its conditions is
unfalsifiable): Lighthouse mobile emulation with a **4G network model — 10 Mbps,
40 ms RTT, 4× CPU slowdown**. Not Lighthouse's default "slow 4G" lantern profile
(1.6 Mbps / 150 ms RTT): that simulates a p95 network tail on which a server-rendered,
web-font page structurally cannot reach 2.0 s LCP. The machine-readable
form is `THROTTLING` in `scripts/performance-budget.mjs`, welded to this paragraph by the
same unit test that welds the template list.

**What these numbers claim — and what they do not.** These are lab numbers under one
fixed condition: they catch *regressions* (a change that pushes a template over the line
fails CI), and that is all they claim. They are **not** a statement about field p75 —
"LCP ≤ 2.0 s mobile" as experienced by real users on real networks is a CrUX/field
question that only field data can answer, and 10 Mbps / 40 ms is a favourable mobile
condition, not a representative one. Reading the table as "our mobile users see ≤ 2.0 s"
would be reading it as stronger than what is tested.

**The five main templates** — named, because a gate over an unnamed set cannot be proven
(the phase-gate lesson). These are the five page *shapes* every public URL is an instance
of; measuring one representative of each measures the template, and a sixth template joins
this table and the pinned list together:

| # | Template | Representative route |
|---|---|---|
| 1 | Homepage | `/` |
| 2 | Category | `/kategoriler/[slug]` |
| 3 | Product | `/urunler/[slug]` |
| 4 | Manufacturer profile | `/ureticiler/[slug]` |
| 5 | City landing | `/sehirler/[slug]` |

Canonical machine-readable source: `scripts/performance-budget.mjs` — `ci-lighthouse.mjs`
reads it, and a unit test asserts this table and that module name the same five, so the
document and the gate cannot drift apart.

Enforced by: `next/image` with explicit `sizes` and no layout shift, fonts self-hosted with
`font-display: swap` (Montserrat + Inter, subset for Latin Extended so Turkish glyphs render
without a fallback flash), no CDN Tailwind in production (the Stitch screens' loading pattern
is a mockup convenience, not a shipping one), and Lighthouse CI on the five templates above
in the pipeline (`23-deployment-and-environments.md`).

## Content that has to exist at launch

Empty marketplaces do not rank. Before public launch: one price guide per seed product, one
"how it works" page per role, city landing pages for the top 10 cities by manufacturer
coverage, and at least three portfolio-bearing manufacturer profiles per city. This is a
launch dependency in `21-development-roadmap.md`, not a marketing afterthought.
