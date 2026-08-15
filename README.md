# Outdoor Systems Marketplace — Documentation

A marketplace connecting customers who want outdoor architectural systems (pergolas, winter
gardens, glass systems, shading) with verified manufacturers in Turkey.

**Start with `00-project-overview.md`. Then read only the files your task names below.**
Reading the whole set for one feature wastes context and produces worse code, not better.

## Where things are

| Path | What |
|---|---|
| `Yazılım Mimari Promptlar/` | the numbered documents `00`–`26`. Every bare `NN` reference below resolves here |
| `Frontend Tasarım/stitch_outdoor_architectural_marketplace/` | the 77-screen design reference |
| `README.md`, `CLAUDE.md` | repository root |
| `src/`, `prisma/`, `e2e/`, `test/` | application code, from Phase 0 onward |

Application code lives at the repository root, not inside either of the two folders above.
Both are committed and both are excluded from the Next.js build and from `tsconfig` —
they are reference material, not source (`20-testing-strategy.md` §What is deliberately not
tested).

## Router — task to documents

| If you are working on… | Read |
|---|---|
| Anything, first time in the repo | `00`, `01` |
| Database schema, a migration, a new table | `04`, plus the module's own doc |
| A new module, folder layout, where code goes | `05`, `04` |
| An API endpoint or a server action | `06`, `05`, the module doc |
| A page, component, or a Stitch screen | `07`, `22`, the module doc |
| Prices, price books, estimates | `08`, `04`, `24` (ADR-005/006/007) |
| Matching, service areas, ranking | `09`, `04`, `08` |
| The project wizard / configurator | `10`, `04`, `07` |
| Offer requests, appointments, offers, KDV | `11`, `04`, `13` |
| Login, permissions, roles, tokens | `12`, `02` |
| Emails, SMS, in-app notifications | `13`, `11` |
| Uploads, images, documents | `14`, `07` |
| Messaging | `15`, `11` |
| Reviews and ratings | `16`, `09` |
| Admin panel | `17`, `02`, `19` |
| Public pages, SEO, CMS | `18`, `07`, `22` |
| Personal data, consent, KVKK, security | `19`, `12`, `11` |
| Writing tests | `20`, the module doc |
| Planning, sequencing, "what's next" | `21`, `26`, `25` |
| Design tokens, components, theming | `22`, `07` |
| Deploy, env vars, migrations, backups | `23`, `05` |
| "Why is it built this way?" | `24` |
| "Where did we get to?" | `25` |

## The files

| # | File | What it settles |
|---|---|---|
| 00 | `00-project-overview.md` | what this is, the stack, the one flow that matters |
| 01 | `01-product-requirements.md` | numbered requirements (`REQ-*`) tests and commits cite |
| 02 | `02-user-roles-and-permissions.md` | actors, company roles, permission catalogue |
| 03 | `03-user-flows.md` | the core flow and every failure path |
| 04 | `04-data-model.md` | tables, money as kuruş, indexes, deferred tables |
| 05 | `05-system-architecture.md` | modules, ports, errors, jobs, caching |
| 06 | `06-api-specification.md` | `/api/v1`, envelope, pagination, rate limits |
| 07 | `07-frontend-architecture.md` | routes, the 77-screen map, rendering, i18n |
| 08 | `08-pricing-engine.md` | the estimate algorithm, bands, versioning |
| 09 | `09-manufacturer-matching.md` | eligibility, scoring, ranking, zero results |
| 10 | `10-project-configurator.md` | the wizard, validation, anonymous drafts |
| 11 | `11-offer-request-lifecycle.md` | the state machine and contact disclosure |
| 12 | `12-authentication-authorization.md` | sessions, tokens, gates, context |
| 13 | `13-notifications.md` | events, channels, templates, preferences |
| 14 | `14-file-storage-and-media.md` | uploads, limits, access classes, retention |
| 15 | `15-messaging.md` | threads, polling, rules |
| 16 | `16-reviews-and-ratings.md` | eligibility, moderation, aggregates |
| 17 | `17-admin-system.md` | queues, verification, settings, audit |
| 18 | `18-cms-seo.md` | URLs, metadata, structured data, budgets |
| 19 | `19-security-and-kvkk.md` | consent, disclosure, retention, app security |
| 20 | `20-testing-strategy.md` | what is tested and to what standard |
| 21 | `21-development-roadmap.md` | phases, gates, risks |
| 22 | `22-design-system.md` | canonical theme, tokens, patterns |
| 23 | `23-deployment-and-environments.md` | envs, migrations, backups, runbooks |
| 24 | `24-decisions-log.md` | ADR-001..013 |
| 25 | `25-progress.md` | current state, log, open questions |
| 26 | `26-execution-plan.md` | how to start each phase: ordered tasks, evidence, decision calendar |

## Design reference

`Frontend Tasarım/stitch_outdoor_architectural_marketplace/` — 77 Stitch screens
(`code.html` + `screen.png`), four `DESIGN.md` themes, one sitemap. It is **specification,
not source**: take layout, hierarchy, states and copy intent; never copy the CDN Tailwind
config, the inline scripts, or the expiring image URLs. See `22-design-system.md`
§Migrating a Stitch screen and `07-frontend-architecture.md` §Route map.

## The five things most likely to be got wrong

1. **Money is integer kuruş**, everywhere, always (`ADR-005`).
2. **Contact data is disclosed exactly once**, on acceptance, with consent and a record
   (`11`, `19`).
3. **Customers see a price band, never line items** (`ADR-006`).
4. **Estimates exclude KDV; offers state it** (`ADR-007`).
5. **A design existing is not a decision to build it** — plans, subscriptions, invoices and
   the configurator builder are designed and deliberately not built (`ADR-010`, `ADR-008`).
