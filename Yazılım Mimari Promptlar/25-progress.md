# 25 — Progress

The only file updated after **every** task. Append to the log, update the phase table, keep
open questions honest. If this file is stale, the next session starts by re-deriving what
someone already knew.

## Status

**Current phase:** **Phase 4 is complete and its gate is proven** (2026-08-23); **Phase 5's
engine half (5.1–5.5) is built and integration-proven** the same day, its surface (5.6–5.9)
not started. A visitor — signed in or anonymous — walks the wizard to `READY`, the draft
survives a browser restart, registration claims it, and the old cookie gets a 404. Behind
that, the match pipeline runs: one-query eligibility over PostGIS, seven-component scoring
with a stored breakdown, a pricing pass that never drops an unpriceable manufacturer, a
deterministic ranking and a persisted `MatchRun`.

**The D3 pilot session is still runnable.** `27-d3-pilot-guide.md` is a one-page script for
it, with a seeded manufacturer login, a table of what to observe, and Q11–Q18 phrased as
questions to ask. The pilot account is deliberately left **without** a price book, because
building one from nothing is the thing being observed.

The application runs: `docker compose up -d && pnpm seed demo && pnpm dev` gives a working
local stack with 81 provinces, 974 districts, the full account flow with real web sessions
(`ADR-022`), an anonymous configurator with claiming (`ADR-023`), and a manufacturer who can
price their work. **991 unit tests, 276 integration tests** against real PostGIS and MinIO
containers, and **43 Playwright specs green** (18 still skipped for later phases). Mail and
SMS go to the log adapters, which is what Q3 and Q2 leave available.

## Phase tracker

Status values: **⬜ not started** · **🟡 in progress · n/m** · **✅ gate met**.

The middle one exists because it was missing: for fifteen tasks Phase 0 read "not started"
while most of it was built and verified, which is not a rounding error, it is wrong
information. A phase moves to 🟡 on its first landed task and to ✅ only when its gate is
proven — not when the code is written.

| Phase | Scope | Status | Gate |
|---|---|---|---|
| Docs | 00–26, README, CLAUDE.md | ✅ done | — |
| 0 | Foundation | **✅ gate met · 17/17** | pipeline green, shells render in tr/en — proven, see 2026-08-16 |
| 1 | Identity | **✅ gate met · 9/9** | authorisation matrix covers every service method — proven, see 2026-08-16 |
| 2 | Catalogue + admin skeleton | **✅ gate met · 7/7** | admin adds a product with no deploy — proven, see 2026-08-16 |
| 3 | Manufacturer supply side | **✅ gate met · 8/8** | a company is matchable — proven, see 2026-08-16 |
| 4 | Project configurator | **✅ gate met · 9/9** | a customer walks the wizard to READY and it survives a restart — first half proven 2026-08-17, anonymous half proven 2026-08-23: `phase4-gate.spec.ts` green, full pipeline green |
| 5 | Matching + pricing | **✅ gate met · 9/9** | `GET OFFERS` returns ranked priced results — proven 2026-08-24: `core-flow.spec.ts` steps 3–4 green against the seeded supply, zero-match ladder included; p95 805 ms for 200 candidates, asserted in CI |
| 6 | Offer request lifecycle | **🟡 in progress · 6/10** | `e2e/core-flow.spec.ts` green — machine, service, consent, disclosure, DTO boundary and the concurrency proof landed 2026-08-24; surface + SLA job + offers (6.6–6.9) remain |
| 7 | Communication + trust | ⬜ | every notification event fires with a `tr` template |
| 8 | Public site + SEO | ⬜ | performance budgets met in CI |
| 9 | Hardening + launch | ⬜ | pre-launch checklist ticked by evidence |

## Log

### 2026-08-15 — Documentation set completed

- Confirmed the design reference exists: `Frontend Tasarım/stitch_outdoor_architectural_marketplace/`,
  77 screens (`code.html` + `screen.png`), 4 `DESIGN.md` themes, 1 sitemap. Nine `screen.png`
  files are `<FIFE Image failed to fetch>` placeholders; those screens have `code.html` only.
- No application code in the repository — greenfield confirmed.
- Wrote `00`–`25`, `README.md`, `CLAUDE.md`.
- Decisions recorded as ADR-001..013 (`24-decisions-log.md`). The three that shape the most
  code: **ADR-006** (per-manufacturer estimates shown as a band), **ADR-008** (no configurator
  rules engine), **ADR-010** (payments modelled, not built).
- Two model corrections came from reading the screens rather than the brief:
  regional adjustments need `FLAT` as well as `PERCENT` (the pricing screen shows `+₺10,000`),
  and project attachments include documents, not just photos (`site_plan_v2.pdf`).

### 2026-08-15 — Execution plan added (`26-execution-plan.md`)

- `21-development-roadmap.md` defines phase scope and gates; `26` adds the layer under it —
  ordered tasks per phase, the artefact and the evidence for each, and a decision calendar.
  `README.md` router updated.
- Finding that changes this table: **Q1 → Q2 → Q3 is a chain, not three independent rows.**
  A Turkish alphanumeric SMS sender ID is allocated only to an İYS-registered business, which
  needs a registered legal entity; provider-side approval of the header itself is short
  (commonly 1–3 business days). So the long lead time is Q2, and Q2 is upstream of the Phase 1
  phone-verification path, not a Phase 9 launch item. Q2 rows updated below.
- Q6 checked against the current Turkish standard rate: **20%**, covering pergola supply and
  installation. Stays a `PlatformSetting`; confirm with an accountant before Phase 6.
- Two workstreams named that were previously only risks: seed-catalogue authoring (blocks
  Phases 4 and 5) and pilot-manufacturer recruitment (retires the price-book data-entry risk
  in Phase 3, not Phase 9).
- Proposed and **not yet decided**: `ADR-014` (one migration per phase, `ADR-010` tables in
  migration 1); sequencing Phase 3 before Phase 4 for a single developer; moving the pricing
  engine and its golden files into Phase 3 so the simulator has something to call. See
  `26-execution-plan.md` §What this plan proposes changing elsewhere.

### 2026-08-15 — Phase 0 tasks 0.1, 0.2, 0.3 (commit `P0.1-0.3`)

First application code. Tasks 0.4–0.17 are untouched; the Phase 0 row is **not** moved,
because the gate (shells rendering in both locales, pipeline green end to end) is not met.

**0.1 — repo and toolchain.** pnpm workspace, Next.js 15 App Router, TypeScript strict with
`noUncheckedIndexedAccess` and `noImplicitOverride`, ESLint flat config, Prettier, husky +
lint-staged (`pnpm lint-staged` then `pnpm typecheck` on commit). `src/app/page.tsx` is a
deliberate placeholder: `[locale]`, route groups and next-intl are 0.13, and half of an i18n
setup is worse than none.

**0.2 — typed env.** `src/shared/config/env.ts`, the variable list taken verbatim from
`23-deployment-and-environments.md` §Configuration. `next.config.ts` imports it, so the parse
runs before `next dev`, `next build` or `next start` does anything. No escape hatch, no
`SKIP_ENV_VALIDATION`.

**0.3 — local stack.** `docker-compose.yml` with PostGIS and MinIO on named volumes with
healthchecks, plus a `minio-init` service that creates the bucket via `mc` so nothing has to
be clicked. `.env.example` matches the compose credentials line for line.

**Versions pinned** (exact, no ranges; lockfile committed):

| | | | |
|---|---|---|---|
| next 15.5.23 | react 19.2.8 | react-dom 19.2.8 | zod 4.4.3 |
| typescript 5.9.3 | eslint 9.39.5 | typescript-eslint 8.67.0 | eslint-config-next 15.5.23 |
| eslint-config-prettier 10.1.8 | prettier 3.9.6 | vitest 4.1.10 | husky 9.1.7 |
| lint-staged 17.3.0 | @eslint/eslintrc 3.3.6 | @types/node 26.2.0 | @types/react 19.2.18 |
| pnpm 11.21.0 | node 24.19.0 | postgis/postgis:16-3.4 | minio RELEASE.2025-09-07T16-13-09Z |

Two version choices are deliberately **not** the latest release:

- **TypeScript 5.9.3, not 7.0.2.** TS 7 is the native port; `typescript-eslint` 8 and
  `eslint-config-next` 15 are built against the 5.x API. Revisit when both declare support.
- **ESLint 9.39.5, not 10.8.1.** `eslint-config-next` 15 targets ESLint 9. Moving to 10
  belongs with the Next 16 upgrade, not before it.

Staying on Next 15 is `00-project-overview.md`'s decision, not an oversight — Next 16.3.1 is
current. Upgrading is a separate decision that wants an ADR.

**Evidence** (every command actually run, on this machine):

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm build` | exit 0, 4 static routes |
| `pnpm test` | exit 0, 22 tests |
| `pnpm dev` + `curl localhost:3000` | HTTP 200, `lang="tr"`, placeholder rendered |
| `pnpm format:check` | exit 0 |
| required env var deleted → `pnpm dev` | **fails at startup**, `EnvValidationError: … DATABASE_URL: Invalid input: expected string, received undefined`, exit 1 |
| `any` + `process.env` probe file | 2 lint errors, exit 1 |
| `NEXT_PUBLIC_` key among server vars | `TS2322: Type 'ZodString' is not assignable to type 'never'` |
| non-`NEXT_PUBLIC_` key among client vars | same error, after the guard was fixed |
| pre-commit hook, `any` in a staged file | commit **blocked**, lint-staged reverted the stage, exit 1 |
| `docker compose up -d` | **not run — see blocker below** |

**The guard was decorative until it was probed.** `defineClientVars` was first written as
`<T extends Record<\`NEXT_PUBLIC_${string}\`, ZodType>>`. TypeScript accepts a
non-matching key against a template-literal index signature, so a probe declaring
`MAIL_API_KEY` alongside a public var compiled cleanly. Rewritten as a mapped type that
resolves the offending key to `never`, matching the server-side guard. The general lesson is
`26`'s own point about 0.8: a rule nobody watched fail is not a rule.

**Blocker — Docker cannot run on this machine.** Node 24.19.0 and pnpm 11.21.0 were installed
here, and Docker Desktop with them (CLI 29.7.2 present at
`C:\Program Files\Docker\Docker\resources\bin\docker.exe`). The daemon does not come up:
`docker info` fails with `failed to connect to the docker API at
npipe:////./pipe/docker_engine`. The cause is not the install — `systeminfo` reports
`Virtualization Enabled In Firmware: No` and `Win32_Processor.VirtualizationFirmwareEnabled`
is `False`. Docker Desktop needs WSL2 or Hyper-V and both need VT-x/AMD-V enabled in
BIOS/UEFI, which is a firmware setting no installer can change.

So evidence 1 and 2 of the 0.3 definition of done (`select postgis_version()` returning,
MinIO bucket reachable) are **unverified**, and 0.4 (Prisma) cannot start until they are.
`docker-compose.yml` was checked for content and image-tag validity only — the tags were
resolved against Docker Hub, not pulled.

**To unblock:** enable virtualization in BIOS/UEFI (usually *Intel VT-x* / *AMD SVM* under
CPU or Security), reboot, start Docker Desktop once, then:

```
docker compose up -d
docker compose ps                                        # postgres + minio healthy
docker exec pergola-postgres psql -U pergola -d pergola -c "select postgis_version();"
docker compose logs minio-init                           # "bucket pergola-local ready"
```

**Assumptions made, because they were not in the docs and did not block the rest:**

1. `23` §Configuration lists variable names, not which are required. Applied: all required
   except `MAIL_API_KEY`, `SMS_API_KEY`, `GEOCODER_API_KEY`, `SENTRY_DSN`. An API key becomes
   required as soon as its provider is not the `log` adapter; `SENTRY_DSN` becomes required
   in staging and production; the `log` adapters are refused outright in production. This is
   conditional requirement, not a silent default.
2. `SMS_PROVIDER` is a free string with `log` reserved, rather than an enum, because Q3 has
   not chosen a provider and inventing a vendor list would be fiction. `MAIL_PROVIDER` is an
   enum (`log | resend | smtp`) because `00` names those two.
3. `APP_ENV` accepts exactly the four environments in `23` §Environments. Tests run with
   `APP_ENV=local` rather than adding a fifth value.
4. `"type": "module"` in `package.json`, and `.gitattributes` forcing `eol=lf` — without the
   latter, Git's autocrlf breaks `pnpm format:check` on a clean Windows checkout.
5. pnpm 11 removed `onlyBuiltDependencies`; build scripts are allowlisted with `allowBuilds`
   in `pnpm-workspace.yaml`, limited to `sharp` and `unrs-resolver`.

**Nothing here contradicts a document.** `26` §Phase 0 rows 0.1–0.3 are implemented as
written; the only divergence is that 0.3's evidence could not be produced on this hardware.

### 2026-08-15 — Phase 0 review fixes (commit `P0.1-0.3 düzeltmeleri`)

Six review findings on 0.1–0.3. No new scope, nothing from 0.4.

**1 · No brand name in code.** `package.json` name is `marketplace`; the page title, the
`<h1>` and the `metadata.title` are the literal `{brand}` placeholder, which is Q1's
documented default rather than one of its five undecided candidates. Task 0.13 binds it to
an i18n key.

**2 · Env validation moved from build to startup.** `next.config.ts` no longer imports the
env module. `src/instrumentation.ts` does, from Next's `register()` hook, which runs once
per server process and never during `next build`. This is what `23` §Configuration actually
requires ("fails **startup**"), and it is the only version compatible with `23` §Runtime:
one image is built without production secrets and started many times with them. No bypass
flag was added — the fix is the right hook, not an escape hatch.

**3 · `import 'server-only'`** replaces the runtime `typeof window` throw in `env.ts`. The
violation is now a compile error rather than something a user discovers.

**4 · The compose comment no longer states an assumption as fact.** The cluster stays
`--locale=C`; the comment says why and admits it only matches production if production is
created the same way. The collation rule is now written down in `04-data-model.md`
§Conventions (`City.name`, `District.name`, `Company.displayName` get
`COLLATE "tr-TR-x-icu"`; the cluster does not, because Turkish collation lower-cases `I` to
`ı` and would break email, slug and identifier comparison), and `23` §Migrations now
requires the production database to be created with the same locale, with
`SHOW lc_collate;` as the check.

**5 · `Prompt/` removed** from the `tsconfig.json` exclude list and from `REFERENCE_DIRS` in
`next.config.ts`. It is a disposable copy, not a reference directory.

**6 · `allowImportingTsExtensions` removed.** The `.ts` specifier in `vitest.config.ts`
became `.js`, which TypeScript resolves to the `.ts` source and Vite's native config loader
accepts. No flag, no warning, both green.

**Evidence** (re-run from a clean `.next`, `pnpm install --frozen-lockfile` first):

| Check | Result |
|---|---|
| `pnpm typecheck` · `lint` · `test` · `build` · `format:check` | all **exit 0**, 22 tests |
| `pnpm build` with **no `.env` file at all** | **exit 0** — the build no longer needs secrets |
| `pnpm start`, still no `.env` | server refuses to prepare, every request **500**, all 15 required variables listed |
| `pnpm dev` with `AUTH_SECRET` deleted | **does not bind at all** — `curl` gets connection refused; error names `AUTH_SECRET` |
| `pnpm dev` with a valid `.env` | **HTTP 200**, `lang="tr"`, `<title>{brand}</title>` |
| client component importing `env.ts` → `pnpm build` | **fails**: `You're importing a component that needs "server-only"`, with the import trace |

**Two things worth knowing about the new startup path:**

- `next start` with a bad environment does **not** exit the process; Next reports
  `Failed to prepare server` and answers every request with a 500. A TCP-only health check
  would call that container healthy. The HTTP `/api/health` endpoint from task 0.15 is what
  makes this safe in production, and it now has a second reason to exist. `next dev` is
  stricter — it never opens the port.
- `server-only` throws on import outside a bundler that sets the `react-server` export
  condition, so Vitest needed `test.alias` pointing at `test/stubs/server-only.ts`. That
  weakens nothing: the guard is a compile-time one and is proven by the build probe above,
  not by a unit test.

### 2026-08-15 — Phase 0 tasks 0.9, 0.10, 0.11, 0.12, 0.13 (commit `P0.9-0.13`)

Taken out of numeric order on purpose: 0.4–0.8 need a database and Docker is still blocked
(Q8). These five need none. Together they close the *"an empty page renders in both locales
through the real shells"* half of the Phase 0 gate; the pipeline half still needs 0.14.
**The Phase 0 row is not moved** — 0.4–0.8 and 0.14–0.17 are untouched.

**0.9 — tokens.** Full palette, type scale, spacing, radius, the single shadow and the
600/900/1200 breakpoints in `globals.css`. `ADR-012`'s radius scale, not the screen configs.
Semantic aliases are a second `@theme` block; components never see a raw role name.

**0.10 — fonts and icons.** Montserrat 600/700 and Inter 400/500/600 via `next/font/google`
with `latin` + `latin-ext`, so nothing reaches Google at runtime and Turkish glyphs never
fall back. Material Symbols Outlined self-hosted and subsetted.

**0.11 — primitives.** All 23 from `22` §Component base, plus `Icon`. Restyled centrally;
no colour is decided at a call site. `/dev/ui` renders every one with its variants and
states.

**0.12 — shells.** `PublicShell` and `DashboardShell` on the comfortable scale (1200px
container, 64px margins, 48/80 rhythm); `PortalShell` and `AdminShell` on the dense one
(full width, 24px gutters, 8/12 rhythm, 44px rows). Nav labels are message keys. The four
`ADR-010`/`ADR-008` screens appear nowhere in navigation.

**0.13 — i18n.** `tr` unprefixed at the root, `en` prefixed, catalogues namespaced by
module. `{brand}` is now a message key rather than a literal.

#### Evidence

| Check | Result |
|---|---|
| `pnpm typecheck` · `lint` · `test` · `build` · `format:check` | all exit 0 |
| tests | **125 passed** (was 22) |
| `/`, `/en`, `/hesap`, `/en/hesap`, `/panel`, `/en/panel`, `/yonetim`, `/en/yonetim`, `/dev/tokens`, `/en/dev/tokens`, `/dev/ui` | all **HTTP 200**, correct `lang`, correct language in `<h1>` |
| build output | 15 static pages, every route prerendered for both locales |
| contrast audit | **24 audited pairs, 24 pass**; 2 decorative pairs shown with ratios |
| touch targets at 375px | 65 interactive elements, **0 under 44px**, no horizontal overflow |
| focus ring | `rgb(22,40,57)` = `primary`, 2px, 2px offset, on `:focus-visible` only |
| icon font | 9.8 KB subset vs 696 KB full — **98.6% smaller** |
| hex literal / arbitrary value / bare JSX string fixture | 4 lint errors, exit 1 |

#### Findings

**1 · The badge palette in `22` was wrong, and the screens already knew.** Asked to check
whether `PENDING`→`tertiary-container` and `ACCEPTED`→`secondary-container` can share a
table column: they cannot. `primary-container` (`#2c3e50`) and `tertiary-container`
(`#612f00`) are dark chips; `secondary-container` (`#7bf8a1`) is a light one. Not a contrast
failure — all three clear 4.5:1 (4.53 / 4.55 / 4.56) — a tonal one.
`manufacturer_portal_dashboard_final` uses the **`*-fixed`** family instead
(`bg-secondary-fixed` + `text-on-secondary-fixed-variant`, `bg-primary-fixed`,
`bg-tertiary-fixed`, `bg-surface-container`), which is uniformly light-on-dark-text and
measures ≥ 7.2:1 throughout. `ADR-012` → screens win. `22` §Semantic mapping rewritten; no
new colour invented.

**2 · `22` Rule 5 pointed at the wrong pair.** `on-surface-variant` on
`surface-container-low`, named there as "most likely to fail", is **8.49:1**. The actual
failure is not text at all: **`outline-variant` is 1.61:1**, under the 3:1 that WCAG 1.4.11
requires of a boundary identifying a control. `divider` and `control-border` are now
separate semantic names — the faint one may separate rows, the other outlines inputs
(`outline`, 4.25:1). Rule 5 rewritten.

**3 · `22` contradicted itself on button height.** §Component base says 40px; Rule 4 says
44px minimum touch target. On a phone those cannot both hold. Resolved: 44px below `sm`,
40px from `sm` up (36px dense), same for inputs and selects; checkbox, radio and switch keep
their drawn size and get a 44px `::before` hit area. Written into `22`.

**4 · Tailwind is on 4.3.3, so `22`'s `theme.extend` was a v3 description.** v4 has no
`tailwind.config.ts`; `@theme` in CSS is the config and emits the custom properties
directly. `22` §Tokens corrected, as `CLAUDE.md` §Definition of done requires. Note that
`26-execution-plan.md` row 0.9 still names `tailwind.config.ts` as an artefact — that file
does not and should not exist.

**5 · tailwind-merge was silently deleting the type scale.** `cn('text-body-sm',
'text-muted')` returned `'text-muted'`: `text-body-sm` looks like a colour, so tailwind-merge
treated the two as conflicting and dropped the size. Every component that sets a size and a
colour in one call — nearly all of them — was losing its font size invisibly. Custom spacing
had the milder version: `cn('px-md','px-sm')` kept both and let stylesheet order decide.
Fixed by declaring the token scales through `extendTailwindMerge`; `utils.test.ts` pins the
vocabulary to `globals.css`. This is the one that would have been hardest to find later.

**6 · Two bugs the browser found that no unit test would have.** The middleware matcher was
written `'.*\..*'` instead of `'.*\\..*'`; in a JS string that collapses to "any path with
two or more characters", so every unprefixed Turkish route fell out of the middleware and
404'd while `/` kept working — locale routing looked fine. And `{brand}` as a message value
is parsed by ICU as a variable placeholder, which threw `FORMATTING_ERROR` in
`generateMetadata`; it needs escaping as `'{brand}'`.

#### Assumptions

1. `/dev/*` lives under `[locale]` so there is a single root layout. It is gated on
   `APP_ENV === 'production'` → `notFound()`.
2. `react/jsx-no-literals` is disabled for `src/app/**/dev/**` only. Those pages render
   token names, variant names and hex values verbatim; translating them would defeat the
   page. It is the only exception in the lint config.
3. shadcn/ui primitives are hand-written into `src/components/ui` in shadcn's shape rather
   than generated by its CLI, because the CLI writes its own palette and icon library
   (lucide) which would then have to be stripped — and `22` says do not mix icon sets.
   `components.json` is present and points at the semantic tokens so `shadcn add` still
   works.
4. Route stubs exist only for the four shell landing pages. The Turkish slug map in `07`
   §Route map arrives with the pages themselves, phase by phase.

### 2026-08-15 — Interaction tokens, plus Phase 0 tasks 0.14 and 0.16 (commit `P0.14+0.16 · hover tokenları`)

0.15 and 0.17 are not in this change: both need Prisma, and a half-built health endpoint or
seed profile is something 0.4 would have to unpick. **The Phase 0 row does not move** —
0.4–0.8, 0.15 and 0.17 are open.

#### A · Interaction states are now part of the semantic layer

**Audit: 17 raw-palette uses across 10 of the 31 files under `src/components`.** Not only
hovers — `bg-inverse-surface` in three components, `bg-surface-container-high` as a track in
two, `bg-primary-fixed` as an avatar fill. The count is now **0**, and
`scripts/audit-raw-tokens.mjs` reports it on demand.

The worst of them was `hover:bg-on-error-container` on the destructive button: an `on-*`
role — a *foreground* colour — used as a background. It reads plausibly and is wrong, and
nothing in the system objected.

Values, derived rather than invented:

| Token | Value | Source |
|---|---|---|
| `action-hover` | `primary-container` | the screens: `<button class="bg-primary … hover:bg-primary-container">` in `outdoor_systems_public_homepage_final` |
| `confirm-hover` | `#00783d` | `brightness(1.1)` of `secondary` — the effect `customer_dashboard_final` renders as `hover:brightness-110`, expressed as a value |
| `destructive-hover` | `#cd1d1d` | the same derivation applied to `error`; the screens have no destructive button |
| `action-wash` | `primary-fixed` | outline-button hover fill, avatar fallback |
| `panel-hover` | `surface-variant` | the screens' commonest hover fill — 26 uses across the four `_final` screens |
| `track` | `surface-container-high` | progress track, skeleton, switch when off |
| `inverse` / `on-inverse` / `inverse-hover` / `scrim` | `inverse-surface` / `inverse-on-surface` / `primary-container` / `inverse-surface` | admin chrome, tooltip, modal scrim |

Only `confirm-hover` and `destructive-hover` are not lifted straight from the theme file.
**One screen was deliberately not followed:** `bg-secondary hover:bg-secondary-fixed` would
put white text on `#7efba4` at 1.5:1. Where screens disagree, the one that passes AA wins.

All nine new pairs are in the `/dev/tokens` audit: **33 audited pairs, 33 pass** (was 24).

The lint rule was extendable, so it exists: raw palette names are an error under
`src/components`, and **the banned list is generated from `globals.css` at lint time** — the
first `@theme` block is raw, the second is semantic, so adding a palette entry bans it and
promoting one to an alias allows it, with no list to maintain. Proven with a fixture (2
errors). `22` §Semantic mapping gained an *Interaction states* table, Rule 1 now names raw
palette names alongside hex literals, the `tertiary-container` / `tertiary-fixed`
contradiction on the badge row is fixed, and `26` row 0.9 no longer names `tailwind.config.ts`.

#### B · 0.14 — CI pipeline

`.github/workflows/ci.yml`, in the order `23` §Pipeline and `20` §Pipeline both give:
`static → unit → integration → build → e2e + a11y → lighthouse`. Node from `.nvmrc`, pnpm
from `packageManager`, pnpm store cached, `concurrency` cancels superseded runs of a ref,
`--frozen-lockfile` everywhere.

| Stage | Today |
|---|---|
| static (lint, typecheck, format, raw-token audit, release-gate guard) | **runs** |
| unit | **runs** — 142 tests |
| integration | **skips loudly**, printing that `prisma/schema.prisma` does not exist, that 0.4 is blocked by Q8, and that it will fail once a schema exists without integration tests |
| build | **runs**, with no `.env` — the build needs no secrets |
| e2e + a11y | **runs** — writes `.env` from `.env.example`, then Playwright |
| lighthouse | **skips loudly** — budgets are Phase 8's |
| deploy → staging → smoke → prod | **absent, with a comment saying so.** There is no environment to deploy to; deferred, not forgotten |

`scripts/ci-integration.mjs` has three outcomes and the middle one is the point: schema
present + no integration tests = **fail**. The stage opens itself the day 0.4 lands.
Verified by planting an empty `prisma/schema.prisma` — exit 1 with the list of suites `20`
§Integration owes — then removing it.

`test/ci-workflow.test.ts` parses the workflow and pins the stage order, the `.nvmrc`/pnpm
setup, `--frozen-lockfile`, the "no `.env` in the build job" rule and the absence of deploy
steps, so the pipeline cannot quietly drift from the documents.

#### C · 0.16 — e2e skeleton

`e2e/core-flow.spec.ts`: the nine F1 steps as named `test.skip`s, each carrying the phase
that un-skips it (1–2 → Phase 4, 3–4 → Phase 5, 5–9 → Phase 6).
`e2e/secondary-flows.spec.ts`: the secondary specs from `20` §End to end plus all six rows
of `03` §Failure paths, as `test.fixme` so they read as owed rather than decided — 13 of
them. `scripts/ci-release-gate.mjs` fails CI if the gate file disappears, empties, gains a
`test.only`, or loses one of the nine numbered steps.

#### Evidence

| Check | Result |
|---|---|
| `typecheck` · `lint` · `test` · `build` · `format:check` | all exit 0 |
| tests | **142** (was 135) |
| `pnpm exec playwright test` | exit 0 — **7 passed, 22 skipped**, 0 failed |
| a11y, 7 routes | no WCAG 2 A/AA violations |
| raw palette names under `src/components` | **17 → 0** |
| `/dev/tokens` audit | **33 audited pairs, 33 pass**; 3 decorative shown with ratios |
| integration stage | prints "SKIPPED · prisma/schema.prisma does not exist yet" |
| integration stage, schema planted | exit 1, naming the suites it owes |
| `pnpm build` with **no `.env`** | exit 0 |
| `APP_ENV=production` + `pnpm start` | `/` 200, `/dev/tokens` and `/dev/ui` **404** |
| whole workflow, run locally in order | **all steps passed** (`node scripts/ci-local.mjs`) |

**How the workflow was shown to run: neither `act` nor a push.** `act` needs Docker, and
Docker is blocked by Q8 — installing it would not have helped. There is no git remote, so
there was nothing to push to. Instead `scripts/ci-local.mjs` parses the workflow and
executes every `run:` step on this machine in job order; the output above is that run. What
this does **not** prove: the runner image, the marketplace actions
(`pnpm/action-setup`, `actions/setup-node`, `actions/upload-artifact`) and the pnpm cache.
Those are unverified until the repository has a remote — worth ten minutes on the first push.

#### Findings

**1 · A regression this session introduced, caught by the CI design within the hour.**
`src/app/[locale]/dev/layout.tsx` imported `env` at module scope to read `APP_ENV`. Next
evaluates that while collecting page data — build time — so `pnpm build` started requiring a
full `.env` again, undoing the fix that moved the parse to `instrumentation.ts`. It was
invisible locally because a developer always has a `.env`; the build job deliberately has
none, which is exactly why it has none. Fixed with `force-dynamic` and a dynamic import, so
the read happens when serving. Production gating re-verified afterwards.

**2 · The a11y stage found three real defects in the primitives on its first run**, none of
which any unit test would have caught: `Progress` had no accessible name (`label` is now a
required prop), and `Switch` and `SelectTrigger` allowed nameless instances. This is the
argument for the stage existing in Phase 0 rather than Phase 9.

**3 · One narrow axe exclusion, and it is documented in place.** `/dev/tokens` renders
swatches for pairs that are *deliberately* failing or exempt — that is the page's subject.
They carry `data-contrast-sample` and are excluded from the axe run; every other rule stays
active on that page, and the page's own table plus `design-tokens.test.ts` report those
pairs more precisely than axe can.

### 2026-08-15 — Phase 0 tasks 0.4, 0.6, 0.7, 0.8 and the code half of 0.15 (commit `P0.4+0.6-0.8+0.15`)

**Docker is still not available, so this entry is split into what is verified and what is
written but unproven.** The phase table row does not move; 0.5 and 0.17 are untouched.

#### The blocker, re-measured

The task began from "virtualization is enabled, Docker should work now". It is not, and the
evidence is threefold:

| Signal | Value |
|---|---|
| `systeminfo` → Hyper-V Requirements | `Virtualization Enabled In Firmware: No` |
| `Win32_Processor.VirtualizationFirmwareEnabled` | `False` |
| `Win32_ComputerSystem.HypervisorPresent` | `False` |
| `LastBootUpTime` | **2026-08-15 15:10** — before this session started |
| `docker info` | `failed to connect to the docker API at npipe:////./pipe/docker_engine` |
| `pnpm test:integration` | `Error: Could not find a working container runtime strategy` |

The uptime is the interesting one: the machine has not restarted, so whatever was changed in
firmware has not been read yet. **Fast Startup is enabled** (`HiberbootEnabled = 1`), which
means "Shut down" then power on resumes a hibernated kernel and does *not* re-initialise
firmware settings — only **Restart** does. That is the likeliest explanation and the first
thing to try.

**After restarting, this is the list:**

```bash
docker compose up -d && docker compose ps
docker exec pergola-postgres psql -U pergola -d pergola -c "select postgis_version();"
docker exec pergola-postgres psql -U pergola -d pergola -c "show lc_collate;"
docker compose logs minio-init                 # "bucket pergola-local ready"
pnpm exec prisma migrate deploy                # migration 1, on an empty database
pnpm exec prisma migrate diff --from-migrations prisma/migrations \
  --to-schema prisma/schema.prisma --shadow-database-url "$DATABASE_URL" --exit-code
pnpm test:integration                          # 21 tests
curl -s localhost:3000/api/health | jq         # three checks
docker stop pergola-postgres && curl -si localhost:3000/api/health | head -1   # expect 503
```

#### Verified on this machine

| Check | Result |
|---|---|
| `pnpm typecheck` · `lint` · `test` · `build` · `format:check` | all exit 0 |
| unit tests | **185** (was 142) |
| `pnpm exec playwright test` | exit 0 — 7 passed, 22 skipped |
| `pnpm build` with **no `.env`** | exit 0 |
| `prisma validate` | schema valid |
| `prisma migrate diff --from-empty` | generated 516 lines; 30 more hand-written |
| money rounding, incl. **negative half** | 19 tests — `Math.round(-0.5)` is `-0`, ours is `-1` |
| `Result` / `DomainError` | 11 tests — all seven kinds, all seven status mappings |
| `ActorContext` | 11 tests — shape, route-derived `companyId`, IP precedence |
| module boundary rule | **7 tests**, fixture-driven: 4 violations reported, allowed imports clean, rule inert outside `app/` |
| integration stage | **no longer SKIPPED** — it finds the schema, lists 2 test files, runs them, and fails on the Docker daemon |

#### Not verified — needs the restart

`docker compose up -d` and its four checks · `prisma migrate deploy` on an empty database ·
`prisma migrate diff` being empty (the `23` §Pipeline release gate) · the GiST index existing
in `pg_indexes` · the 21 integration tests · `/api/health` returning its three checks and
dropping to 503 when Postgres stops.

The integration tests are written against exactly those claims, so the restart converts them
from assertions into evidence in one command.

#### 0.4 — Prisma and migration 1

`ADR-014` written and accepted: one migration per phase, `ADR-010`'s deferred tables in
migration 1. Migration 1 is `phase0_foundation` — extensions, Auth.js tables, §Identity and
tenancy in full, `City`/`District`, `PlatformSetting`, `AuditLog`, `Consent`, `File`, and all
six deferred tables. Catalogue, project, pricing, matching, offer, messaging, review and
content are **not** in it.

Thirty lines of the migration are hand-written because Prisma cannot express them: the three
`COLLATE "tr-TR-x-icu"` columns, the three GiST indexes, the partial unique index that
enforces one `OWNER` per company, and the trigram index for directory search.

**`ADR-015` — PostGIS lives behind `src/shared/geo`.** Spatial columns are `Unsupported`,
their indexes are in migration SQL, and `shared/geo` is the only file allowed to write
PostGIS SQL. That is what makes `ADR-002`'s real rule — no Haversine in application code —
structural rather than cultural: a JavaScript distance cannot use a GiST index, so it turns
every match run into a full scan. The wrapper also absorbs the two things everyone gets
wrong once: `ST_MakePoint` is **(longitude, latitude)**, and `geography` distances are
metres while service areas are configured in kilometres. `04` §PostGIS and Prisma records
the pattern for Phase 3's `ServiceArea`.

**Prisma 7 is a bigger change than a version bump.** Connection URLs moved out of
`schema.prisma` into `prisma.config.ts`, and the client now requires a driver adapter
(`@prisma/adapter-pg`) rather than a URL. Both are wired; the adapter reads `DATABASE_URL`
through the typed env, so the database address is still validated at startup with everything
else.

#### 0.6 — `src/shared/`

`result/` is `05` §Errors verbatim — seven kinds, named constructors so a typo cannot
produce a valid-looking error that no adapter matches, and the status mapping in one place.

`money/` is integer kuruş with **half-away-from-zero** rounding. The trap the prompt names is
real and now has a test: `Math.round` rounds towards `+∞`, so `Math.round(-0.5)` is `-0` and
`Math.round(-1.5)` is `-1`. Discounts and regional adjustments produce negative
intermediates (`08` §Algorithm steps 6–7), so using `Math.round` would bias every negative
half by one kuruş in the platform's favour — silently, and only on the boundary. Percentages
are carried as integer basis points so a percentage never adds a second rounding site.

`db/` holds the client, the transaction helper and the soft-delete extension. Two details
worth keeping: the extension applies to **reads only** on the three models `04` names — an
update targeting a soft-deleted row should fail loudly rather than no-op — and
`TransactionClient` is *inferred from the extended client* rather than taken from
`Prisma.TransactionClient`, because `$extends` changes the shape and the stock type silently
loses the extension inside a transaction.

`geo/` is the PostGIS boundary described above.

#### 0.7 — `ActorContext`

`05` §ActorContext verbatim, anonymous-only. Two things Phase 1 must not reshape are already
right: the signature is `(request, params)`, and **`companyId` comes from the route**. A
"current company" in the session would let one tab rewrite another tab's scope and would
delay membership revocation until token expiry (`12` §Context resolution).

#### 0.8 — module boundary

`app/**` may not import `@prisma/client`, `@/shared/db`, `modules/*/infrastructure` or
`modules/*/domain`. `26` suggests a committed fixture that fails CI on purpose; a
permanently-red pipeline is ignored within a week, so the fixture is committed and
`test/module-boundary.test.ts` runs ESLint programmatically and asserts the four errors. The
rule is proven and CI stays green while it is obeyed.

#### 0.15 — harness and `/api/health`

Testcontainers harness: one `postgis/postgis:16-3.4` container per run created with
`--locale=C` to match production, migrations applied by `prisma migrate deploy` — the same
command production runs, so a migration that only works via `db push` fails here — and every
test wrapped in a transaction that is rolled back via a sentinel throw.

`/api/health` checks database connectivity, the latest applied row in `_prisma_migrations`,
and storage reachability, each bounded by a 3 s timeout. A container that is up but
unmigrated reports degraded rather than serving traffic.

#### Findings

**1 · The same build-time coupling reappeared, and the same guard caught it.**
`/api/health` imported the health service at module scope; Next evaluates that while
collecting page data, so `pnpm build` demanded a full `.env` again. Identical to the `/dev`
layout regression in the previous entry. Fixed the same way — dynamic import inside the
handler. **This is now twice.** The pattern is worth stating as a rule: *a file under
`src/app` must not import anything that touches `env` or Prisma at module scope.* The CI
build job having no `.env` is what makes it findable; without that it would have shipped.

**2 · A block comment terminated itself.** `modules/*/infrastructure` inside a `/** */`
comment contains `*/`, which closed the comment and turned the rest of the file into
syntax errors that pointed at unrelated lines. Cost about ten minutes of reading the wrong
part of the file. Written as `modules/<name>/infrastructure` now.

### 2026-08-15 — Non-negotiable 9 and its lint rule. **0.5 and 0.17 not started: Docker still unavailable.**

This session began from "virtualization is enabled and the machine has been restarted".
Neither is true yet, and the instruction for that case was to stop rather than work around
it for a fourth time. So: 0.5 (geography seed) and 0.17 (seed profiles) are **not started**.
Both are entirely database work. The phase table is unchanged.

#### Why the answer is "not rebooted" rather than "rebooted but still broken"

The Windows System event log is unambiguous. `Microsoft-Windows-Kernel-General` records
boot as event 12 and shutdown as 13:

```
15.08.2026 15:10:36  12  operating system started
15.08.2026 15:10:25  13  operating system shutting down
15.08.2026 01:04:48  12  operating system started
```

**There is no boot event after 15:10 on 15 August.** Uptime is 7 h 30 m and
`LastBootUpTime` is still `15.08.2026 15:10:35` — the same value recorded in the previous
entry, hours ago. Alongside that, `systeminfo` still reports
`Virtualization Enabled In Firmware: No`, `VirtualizationFirmwareEnabled` is `False`, and
`docker compose up -d` fails with `failed to connect to the docker API at
npipe:////./pipe/docker_engine`.

Two things to check, in order:

1. **The restart did not happen.** Fast Startup is on (`HiberbootEnabled = 1`), so
   "Shut down" then power on resumes a saved kernel and neither writes a boot event nor
   re-reads firmware. Use **Restart** from the Start menu, or `shutdown /r /t 0`.
2. **The firmware setting may not have been saved.** On this machine (Intel i5-6200U,
   OEM laptop firmware) the option is usually *Intel Virtualization Technology* under
   Configuration or Security, and it needs an explicit Save & Exit — F10 on most of these.

After the restart, the one command that settles it:

```bash
systeminfo | findstr /C:"Virtualization Enabled In Firmware"   # expect: Yes
```

Then the eight-item list in the previous entry runs unchanged.

#### What was done — the one item with no database dependency

**`CLAUDE.md` non-negotiable 9**, and a lint rule that enforces it.

Nothing under `src/app` may import configuration or an application service at module scope.
Next evaluates a route's module graph while collecting page data — build time — so a static
import of anything that reads `env` or builds the Prisma client at load makes `pnpm build`
require production secrets again. That bug shipped twice (`/dev` layout, then
`/api/health`), and both times it was invisible locally because a developer always has a
`.env`. The CI build job deliberately has none, which is what caught it each time; the rule
is what stops it from being caught a third time.

Banned under `src/app/**`: `@/shared/config/env` and `@/modules/*/application/**`.
Deliberately not banned: `@/shared/config/env.client`, whose values are `NEXT_PUBLIC_*` and
are inlined at build time, so evaluating it during the build is correct.

Proven, not asserted: `test/fixtures/boundary/app-imports-env-at-module-scope.tsx` is the
exact shape that shipped twice, and `test/module-boundary.test.ts` lints it and expects both
errors. Seven new tests cover the fixture, each banned specifier, the dynamic import that is
the actual fix, the `env.client` exemption, and the fact that `instrumentation.ts` — which
*must* import `env` at module scope, since it is the startup hook — is unaffected.

| Check | Result |
|---|---|
| `typecheck` · `lint` · `test` · `build` · `format:check` | all exit 0 |
| unit tests | **192** (was 185) |
| `pnpm exec playwright test` | exit 0 — 7 passed, 22 skipped |
| `pnpm build` with no `.env` | exit 0 |
| rule 9 fixture | 2 errors, both naming module scope |
| integration stage | still fails on the Docker daemon, as it should |

#### Still owed, unchanged from the previous entry

The eight-item Docker verification list · Q8 · 0.5 · 0.17 · the Phase 0 gate.

Phase 0's remaining work is now exactly: prove the container stack, seed geography, seed
the three profiles, and close the gate. All four need a database and nothing else blocks
them.

### 2026-08-16 — Phase 0 closed. Tasks 0.5 and 0.17, and the verification debt (commit `P0.5+0.17 · Faz 0 kapanışı`)

**Q8 is closed.** Virtualization was enabled in firmware and the machine restarted;
`docker info` returns server 29.7.2. Everything that had been written-but-unproven across
three sessions ran, and two things in it were wrong — see Findings.

#### The eight-item debt list, with output

| # | Check | Result |
|---|---|---|
| 1 | `docker compose up -d` | `pergola-postgres` and `pergola-minio` both **healthy**; `pergola-minio-init` **exited 0** with `minio-init: bucket pergola-local ready` |
| 2 | `select postgis_version()` | `3.4 USE_GEOS=1 USE_PROJ=1 USE_STATS=1` |
| 3 | database collation | `datcollate = C`, `datctype = C`, provider `c` — **not** via `SHOW lc_collate`, see Finding 1 |
| 4 | bucket | `mc ls` → `pergola-local/` |
| 5 | `prisma migrate deploy` on an empty database | applied `00000000000000_phase0_foundation` cleanly |
| 6 | `prisma migrate diff --from-migrations --to-schema --exit-code` | **`No difference detected`, exit 0** — after Finding 2 |
| 7 | `pg_indexes` | `City_point_gist`, `District_point_gist`, `CompanyContact_point_gist` (all `USING gist`), `Company_displayName_trgm` (`gin_trgm_ops`), and `CompanyMembership_one_owner_per_company` `USING btree ("companyId") WHERE (role = 'OWNER')` |
| 8 | integration + health | **36 integration tests pass**; `/api/health` returns all three checks with `version: 00000000000000_phase0_foundation`; with `pergola-postgres` stopped it returns **503 `degraded`** with database and migrations failing and storage still `true`, and recovers to 200 when the container restarts |

#### 0.5 — geography

**Source: GeoNames, CC BY 4.0** (`prisma/seed/geo/README.md`). Commercial use and
redistribution are explicitly permitted and there is **no share-alike clause** — which is
why OSM-derived lists were rejected: those are ODbL, and shipping an ODbL-derived table
inside a commercial product's database is exactly the case ODbL §4.4 governs. Attribution is
owed and carried in the JSON so it cannot be lost; Phase 8 must surface it on the public
site. Data downloaded **2026-08-15**; the date is recorded because the district list changes.

**81 provinces, 974 districts, every one with a centre point.** Plate codes come from the
official 1–81 list held in `scripts/build-geo-seed.mjs` and matched to GeoNames by name —
GeoNames' `admin1` is its own sequence and is not the plate number.

#### 0.17 — seed profiles

`minimal` (geography, settings, one admin), `demo` (five companies across İzmir, İstanbul,
Ankara, Antalya and Trabzon, in `VERIFIED`/`PENDING`/`REJECTED` states so the admin queue and
the directory both have something to show, plus a customer), `e2e` (fixed ids in
`E2E_IDS`, which `e2e/core-flow.spec.ts` binds to in Phase 6).

**Today's scope is deliberately smaller than `20` §Test data describes.** Migration 1 has no
catalogue, pricing or review tables, so `demo` cannot have price books or ratings yet.
Each profile builds its own skeleton and later phases extend their own slice: Phase 2 adds
products, Phase 3 price books and service areas, Phase 5 a priceable project, Phase 7
reviews. Nothing seeds a table that does not exist.

`PlatformSetting` seeds come from the documents, not from constants: `pricing.band_percent`
10, `pricing.band_min_kurus` 500 000, `pricing.round_step_kurus` 50 000,
`offer_request.sla_hours` 48, `tax.kdv_default_percent` 20,
`matching.max_companies_per_project` 5. Re-running never overwrites a value an admin has
tuned.

All three run on an empty database and are idempotent — asserted in the integration suite by
running each profile twice and comparing both the returned summary and the row counts.

#### Findings

**1 · `SHOW lc_collate` does not exist in PostgreSQL 16.** It was removed as a runtime
parameter; collation is a per-database property now. The check — and the integration test
that asserted it — errored with `unrecognized configuration parameter`. Both now read
`pg_database.datcollate`. `23-deployment-and-environments.md` §Migrations carried the wrong
command and has been corrected. This is the sort of thing that only surfaces when the
command is actually run.

**2 · The release gate was failing, and the fix removed hand-written SQL rather than adding
any.** `prisma migrate diff` reported four differences: Prisma wanted to drop the three GiST
indexes and the trigram index, because they existed in the database but not in the schema.
Prisma *can* express both — `@@index([point], type: Gist)` and
`@@index([displayName(ops: raw("gin_trgm_ops"))], type: Gin)` — so they moved into
`schema.prisma` with `map:` pinning the descriptive names, and out of the hand-written
section of the migration. Hand-written SQL dropped from 30 lines to 12: only the three
`COLLATE` statements and the partial unique OWNER index, which Prisma genuinely cannot model.
Anything Prisma can model belongs in the schema.

Two smaller ones: `migration_lock.toml` was missing (the migration was generated by
`migrate diff`, not `migrate dev`, which is what normally writes it), and Prisma 7 removed
`--shadow-database-url` from `migrate diff` — the shadow database is configured in
`prisma.config.ts` now, derived from `DATABASE_URL` so the gate needs no extra setup.

**3 · GeoNames' district names needed real work, and the fix is a rule rather than a list.**
The raw `ADM2` names were wrong in two ways: **693 of 974** carried an " İlçesi" suffix
(`Çelikhan İlçesi`), and **159** were ASCII-folded (`Yesilhisar`, `Beypazari`, `Canakkale`).
Guessing the diacritics place by place would have been exactly the invented-specification
problem. Instead the build joins GeoNames' Turkish-tagged alternate names and accepts one
**only if it is the same word as the base name once both are folded to ASCII** — which
admits every missing diacritic and rejects renames (`Muradiye / Berkri`) and typos
(`Alacakaya` → `Alacakayal`). 698 names corrected, suffixes gone, and the 18 remaining
central districts took their province's spelling, which is authoritative and in the same
dataset. Result: `Yeşilhisar`, `Beypazarı`, `Çanakkale`, `Lâpseki`.

**4 · The Turkish collation is doing real work, and there is now a test that proves it
rather than asserting it.** On seeded data: `Iğdır < Isparta < İstanbul < İzmir` and
`Bornova < Çankaya < Dinar < Şile < Tuzla`. The same query with `COLLATE "C"` puts
`Dinar` before `Çankaya` — the test asserts both, so the column collation cannot silently
stop applying.

**5 · A build failure that was not a build failure.** Playwright's `webServer` runs
`pnpm build && pnpm start`, which raced a still-running `pnpm dev` over the same `.next`
directory and reported "Build failed because of webpack errors". Killing the dev server
made it pass. Worth knowing before someone spends an hour on the webpack error.

#### Phase 0 gate — proven, not asserted

`21-development-roadmap.md`: *"an empty page renders in both locales through the real
shells, and the pipeline runs green end to end."*

| | |
|---|---|
| `/` · `/en` | 200 · `lang="tr"` / `lang="en"` · *"Projeniz için doğru dış mekân sistemini bulun."* / *"Find the right outdoor system for your project."* |
| `/hesap` · `/en/hesap` | 200 · Panel / Dashboard — `DashboardShell` |
| `/panel` · `/en/panel` | 200 · Panel / Dashboard — `PortalShell` |
| `/yonetim` · `/en/yonetim` | 200 · Komuta merkezi / Command center — `AdminShell` |
| `typecheck` · `lint` · `test` · `build` · `format:check` | all exit 0 · **192 unit tests** |
| `pnpm test:integration` | **36 tests**, real PostGIS container |
| `pnpm exec playwright test` | exit 0 — 7 a11y checks pass, 22 release-gate steps skipped |
| `pnpm build` with no `.env` | exit 0 — the build still needs no secrets |
| `/api/health` | 200 with three checks; 503 when Postgres stops |

**Phase 0: 17/17.** The phase table moved for the first time.

#### Carried into later phases

Nothing from Phase 0 is left half-done. What Phase 0 deliberately deferred, with its owner:

- **`demo` breadth** — price books, reviews, portfolio: Phases 3 and 7, when those tables exist.
- **GeoNames attribution on the public site** — Phase 8 (`18-cms-seo.md` §CMS).
- **District-name spot check by a Turkish reader.** 442 district names are pure ASCII and
  genuinely appear to be so (Ceyhan, Alanya, Kozan); the build cannot distinguish those from
  a diacritic that GeoNames lost and never recorded. A native reader scanning the list once
  is cheap; added as **Q9**.
- **CI has never run the integration stage against Docker.** `scripts/ci-integration.mjs`
  now finds the schema and the tests and runs them, but the GitHub runner has still never
  executed it — the repository has no remote (`25-progress.md`, 2026-08-15). First push.

### 2026-08-16 — Phase 1 tasks 1.1, 1.8, 1.2, 1.3, 1.7 (commit `P1.1+1.8+1.2+1.3+1.7`)

The first half of Phase 1: the permission catalogue, the matrix harness, credentials,
tokens and the real `resolveActor`. No user-facing pages — 1.4, 1.5, 1.6 and 1.9 are the
second half. Phase 1 row is now **🟡 in progress · 5/9**.

#### `modules/iam/` is the template for eleven more modules

The first module, so its shape is the shape every later one copies. What it fixes:

```
modules/iam/
  domain/          permissions.ts, password.ts — pure. No Prisma, no Next, no imports
                   from application/ or infrastructure/.
  application/     auth-service.ts, authorization.ts, dto.ts, actions.ts — takes an
                   ActorContext, asserts, returns Result<T, DomainError>.
  infrastructure/  password-hasher, token-service, identify, captcha — Prisma and adapters.
```

Import direction: `app/` → `application/` → `domain/`, and `infrastructure/` is reachable
only from `application/`. Task **0.8's boundary rule finally has real targets** — until now
it was proven against paths that did not exist. `test/module-boundary.test.ts` gained three
cases against actual files: `modules/iam/infrastructure/identify`,
`.../password-hasher` and `modules/iam/domain/permissions` are each rejected from `app/`,
and the dynamic import of `application/auth-service` is still allowed.

One thing worth copying deliberately: **the server actions live in
`modules/iam/application/actions.ts`, not in `app/`.** Non-negotiable 9 bans `app/` from
importing a service at module scope, and an action file has to import one — so the action
belongs inside the module and the page imports the action.

#### 1.8 — how the matrix mechanism works

Two halves, because either alone has a hole.

**The type.** `serviceMethod(service, method, authorisation, implementation)` cannot be
called without an authorisation spec. The spec is a closed union — `permission`, `owner`,
`admin`, `authenticated`, `anonymous` — so a new kind of authorisation is a deliberate edit
to the union rather than a blank at a call site. `anonymous` and `owner` carry a required
sentence (`why`, `describe`); a test asserts they are non-trivial, because "no
authorisation" must not be the cheapest option on the menu.

**The scan.** A developer can still export a plain `async function` from an `application/`
file and never call `serviceMethod`. `test/authorisation-matrix.test.ts` walks every
`modules/*/application/*.ts`, extracts exported functions, and fails on any not in the
registry — naming the file and the symbol. This is a **unit** test rather than an
integration one, deliberately: the check is pure static analysis, so it gates every
`pnpm test` instead of only the stage that needs a container.

Proven with a fixture: an unregistered `publishPriceBook` in `application/` produced

```
Unregistered service methods:
  src/modules/iam/application/__unregistered-probe.ts → publishPriceBook
Wrap each in serviceMethod() so it enters the authorisation matrix.
```

The grid itself is **generated from the catalogue**, never typed out: 20 permissions × 8
actors (`OWNER`, `ADMIN`, `SALES`, `VIEWER`, other-company, customer, anonymous, global
admin) = 160 cases, plus 20 × 4 roles × 4 statuses = 320 for the role ∩ status half. A
hand-written expectation table would be a second source of truth whose first act would be
to disagree with the first.

**The scan found a real gap on its first run:** `checkHealth`, from Phase 0. It is an
operational probe — no actor, no user data, and a load balancer has no credentials — so it
is the single entry on an exemption list, and a test asserts the list has exactly that one
entry. A second exemption has to be argued for.

#### 1.1 — the catalogue is now genuinely the source

`02`'s table is **generated** by `scripts/generate-permission-table.mjs` between two
markers, and `permissions.test.ts` reads the document back and fails when any cell
disagrees with the code. `02` said the table "must be regenerated from it, never hand-edited
to diverge"; that is now enforced rather than requested.

One permission was added that `02`'s prose implies but its table omits:
`company:document.upload`. `02` §Verification state says a `PENDING` company "can complete
profile and upload documents" and a `REJECTED` one "may resubmit documents" — that is a
capability, and without a name for it the status gate could not express either sentence.

**Capability is role ∩ status, and the two failures are different errors.** Role missing →
`FORBIDDEN`. Role present but the company's status forbids it → `PRECONDITION`. "You are not
allowed" and "your company is suspended" must not read the same to the person who has to fix
it; only the second is actionable.

#### 1.2 — credentials

Argon2id at the parameters `12` fixes — 19 MiB, t=2, p=1 — asserted against the encoded hash
(`m=19456,t=2,p=1`), not just against a constant.

The identical-latency requirement is the part that needed real work. `burnPasswordTime`
verifies against a throwaway hash on the unknown-email path, so both branches pay the Argon2
cost. Measured over five alternating runs, median unknown-email vs median wrong-password,
asserted within 3× — the failure this catches is roughly 100×, and both medians must exceed
5 ms so a branch that skipped the work cannot pass.

Registration returns the same shape for a new and an existing address, and does not
overwrite the existing account.

#### 1.3 — tokens

Access JWT carries exactly `sub`, `role`, `jti`, `iat`, `exp` (plus `iss`/`aud`). The test
decodes the **raw payload** rather than the typed result and asserts the key set exactly,
because a typed reader would hide a claim added "just for convenience" — and the claim that
must never appear is `companyId`.

Refresh tokens are hashed at rest, single-use, and grouped into families. Replaying a used
token revokes the whole family, including the successor the honest client is holding; the
test asserts every row in the family ends `revokedReason: 'reuse_detected'`. Every failure
mode returns the same error to the caller, because "expired" versus "someone else used this"
is exactly what an attacker wants to learn.

Verification tokens (email 24 h, reset 1 h, OTP 5 min) are SHA-256 at rest — a database dump
must not be a set of working reset links. Issuing a new one invalidates the outstanding one,
so three clicks on "resend" do not leave three live links.

#### 1.7 — `resolveActor`

All four steps, with the two IO calls injected so the resolver is unit-testable and so both
surfaces plug into one implementation. `/api/v1` accepts **only** `Authorization: Bearer` —
no cookie is read there, which is why CSRF cannot exist on that surface. The role is read
from the database rather than from the claim, so a role change or a suspension takes effect
on the next request.

The two-tab case is a test: one user, two companies, both open, and the first tab keeps its
own scope after the second loads. So is the revocation case — a membership removed between
two requests is gone on the second.

`resolveActor` deliberately does **not** reject. No membership leaves `companyRole: null`
and `authorize()` turns that into `FORBIDDEN` — one place decides, the same place for every
surface.

#### Both surfaces, one mapping

`src/shared/http/respond.ts` maps `Result` → transport once. `respond()` for route handlers,
`actionResult()` for server actions. The test asserts all seven kinds map to
404/403/422/409/409/429/503 **on both**, and that with a fixed request id the two produce
byte-identical envelopes — the only difference being where the status lives, since an action
cannot set a header. `Retry-After` is set on 429.

`/api/v1/auth/{login,register,refresh}` and `loginAction`/`registerAction`/`refreshAction`
call the same services through the same Zod schemas.

#### Evidence

| Check | Result |
|---|---|
| `typecheck` · `lint` · `test` · `build` · `format:check` | all exit 0 |
| unit tests | **733** (was 192) |
| integration tests | **61** (was 36) |
| `pnpm build` with no `.env` | exit 0 |
| `prisma migrate diff` after migration 2 | `No difference detected`, exit 0 |
| unregistered service method fixture | fails, naming file and symbol |
| `app/` importing iam internals fixture | 3 errors, one per layer |
| Argon2 timing, unknown email vs wrong password | both > 5 ms, ratio < 3× |
| refresh replay | whole family revoked, successor dead |
| JWT payload keys | `aud, exp, iat, iss, jti, role, sub` — no `companyId` |

#### Deferred, with owners

- **CAPTCHA — Q10.** Port built, no provider. Progressive delay and the lockout notification
  are implemented; the challenge is not. *Still open at the end of Phase 1 — see that entry.*
- ~~**Auth events to `AuditLog`**~~ — done in 1.9. Four events, each with IP and user agent.
- **Auth.js wiring.** `identifyFromRequest` reads the `Session` table directly, which is the
  same table the Auth.js Prisma adapter owns. The provider configuration lands with the
  login page in 1.4.


### 2026-08-16 — Phase 1 tasks 1.4, 1.5, 1.6, 1.9 and the gate (commit `P1.4-1.6+1.9 · Faz 1 kapanışı`)

The second half of Phase 1, plus a correction to the first half. Phase 1 row is now
**✅ gate met · 9/9**.

#### The correction: server actions were in the wrong place, and moving them was not the fix

The review point was exact. `modules/iam/application/actions.ts` carried `'use server'` and
`next/headers`, and `05` §ActorContext defines `application/` as framework-agnostic —
*"callable from jobs and tests"*. So the file moved to `src/app/actions/`, where `05` §Two
entry points draws it, alongside the route handlers.

**Moving it changed nothing about the build, and the justification written in it was wrong.**
A page imports the action file statically; the action file imported `auth-service` statically;
`auth-service` reaches `env` and Prisma. The service was still in the page's build-time module
graph one hop further away. What had been keeping `pnpm build` secret-free was never the
file's location — it was laziness deeper in the chain.

Three things changed as a result:

1. **`CLAUDE.md` non-negotiable 9 now says what is banned: module-scope *evaluation*.** Not
   the dependency, not the import statement. `await import(...)` inside a handler is fine.
   `import type` is fine. It applies transitively, which is the part that had been unstated
   and is the part that bit.

2. **The lint rule moved to `@typescript-eslint/no-restricted-imports` with
   `allowTypeImports` on the rule-9 group only.** Types are erased, so a type-only import
   cannot cause the evaluation the rule exists to prevent — and without the allowance the
   actions could not be typed at all, which is how a rule earns a suppression comment. The
   domain and infrastructure bans keep the base behaviour: those are architectural, and
   erasure has nothing to do with why they exist.

3. **Two committed fixtures, the same server action written twice.**
   `test/fixtures/boundary/app-action-static-import.ts` must fail;
   `app-action-dynamic-import.ts` must pass, `import type` and all. A fixture that only
   proves a rule fires proves half of it — a rule that also fires on the correct shape gets
   suppressed, and the suppression is what the next person copies.

#### Verified on this machine

| Check | Result |
|---|---|
| `pnpm test` | **803 passed** (was 733) |
| `pnpm test:integration` | **124 passed** (was 61), real PostGIS container |
| `pnpm test:e2e` | **22 passed, 20 skipped, 0 failed** |
| `pnpm build` with `.env` moved aside | exit 0 |
| `pnpm lint`, `pnpm typecheck` | clean |
| `prisma migrate diff --from-migrations --to-schema --exit-code` | `No difference detected`, exit 0 |
| static import of a service from `app/` | 2 errors, message names module scope |
| dynamic import + `import type` from `app/` | 0 errors |
| authorisation matrix coverage | 18 registered methods, 0 unregistered, discovered from disk |
| manufacturer company created | `PENDING`, creator `OWNER`, slug `oz-pergola` |
| registration + verification e2e | runs, no longer `fixme` |

#### The gate

*The authorisation matrix covers every service method.* It did, and the test that said so was
weaker than it read: it imported `auth-service` by name and scanned for unregistered plain
functions. A new module with six registered methods would have passed without ever being
imported. The scan now **discovers every `application/` module from the filesystem**, imports
each one, and cross-checks the `export const x = serviceMethod` declarations in the source
against the registry. 18 methods, none missing. "Every method the test remembered" and "every
method that exists" read identically in a green run.

*A manufacturer company reaches `PENDING`.* `membership.integration.test.ts` creates one
through the service: creator becomes `OWNER`, company is `PENDING`, and a `PENDING` company
can upload documents and read but cannot publish a price book — `PRECONDITION`, not
`FORBIDDEN`, because "your company is pending" is actionable and "you are not allowed" is not.

*`20` §End to end's registration + verification spec runs.* `e2e/account.spec.ts`, against a
production build: register → follow the link from the mailbox → verify → sign in → reset →
sign in with the new password and fail with the old one. The `permission denied → 403 page`
failure-path row is un-`fixme`d with it. `e2e/core-flow.spec.ts` steps stay skipped — the
project wizard is Phase 4.

#### What the end-to-end suite found that nothing else did

Four defects, all of which passed lint, typecheck, 803 unit tests and 124 integration tests.
They are listed together because they share a shape: **each one is invisible to any test that
does not render the page in a browser.**

**1. `max-w-md` is twenty-four pixels here.** This theme defines a custom spacing scale with
`sm`/`md`/`lg`/`xl`, and in Tailwind 4 a `max-w-*` utility resolves against the container
namespace *and* the spacing namespace — spacing wins. So the auth card was a 24-pixel column,
the heading had a zero-width bounding box, and Playwright reported it `hidden`. The same
mistake was already in `ui/dialog.tsx` from Phase 0 (`max-w-lg` → 48px): **every dialog in the
application was forty-eight pixels wide and nobody had opened one.** Fixed with named tokens
(`--container-form`, `--container-dialog`), a lint rule that rejects the whole `max-w-{scale}`
family in components, and `test/design-system-lint.test.ts` — the design-system rules had
never had a fixture, unlike the boundary rules, and this is what that gap cost.

**2. React 19 empties an uncontrolled form after its action resolves.** Correct for a
successful submit, silently destructive for a rejected one: a mistyped password on the
register screen also cost the person their name, their email and the consent tick. The e2e
suite found it by refilling only the password after a failed login — the emptied email then
failed validation and the screen said "e-posta veya şifre hatalı", which was true and about
entirely the wrong thing. All six forms are now controlled through one `useFields` hook.

**3. Module state is not shared between routes, and `globalThis` is not enough either.** The
dev mailbox began as a module-scope array; Next builds a separate server bundle per route, so
the route handler read a different array from the one the server action wrote — an empty
mailbox, forever, with no error. Parking it on `globalThis` (the Prisma-client trick) fixed
that and then failed *intermittently*, because `next start` serves from more than one process.
It is a file in the OS temp directory now.

**4. Login audit rows were attributed to nobody.** `resolveActor` runs before credentials are
checked, so `actor.userId` is null throughout a login, and `recordAudit(actor, …)` wrote
`actorUserId: null` on the one event where the answer is certain. Login and password reset now
attribute explicitly. `login_failed` deliberately does not: whoever typed the wrong password
may not be the account owner, and recording them as the actor would put an innocent user's id
on an attacker's attempt.

#### 1.4 — the five screens

`/kayit`, `/giris`, `/sifre-sifirla`, `/sifre-yenile`, `/eposta-dogrula`, in both locales,
through the real `PublicShell`. Every capability has **two adapters over one service**: a
server action in `app/actions/auth.ts` and an `/api/v1` route handler, parsing with the same
Zod schema. Nothing about the password policy, the token lifetimes or the enumeration-proof
responses is expressed twice.

`Mailer` is a port with a `log` adapter (`MAIL_PROVIDER=log`, refused in production by the env
schema). Verification tokens live 24 hours, resets 1 hour, both single-use and stored hashed —
and **a completed reset revokes every other session**, because the likeliest reason somebody
resets is that they think someone else has their password.

**Consent.** Registration writes `Consent(type=TERMS)` in the *same transaction* as the user:
consent is evidence, and evidence written after the fact goes missing exactly when the second
write fails. The `textVersion` is a **content hash of the committed file** —
`terms.tr@<sha256[0:8]>` — not a constant. A constant passes every check anyone would think to
write, right up until somebody edits the text and forgets it; from then on every consent row
records agreement to a document nobody agreed to, silently, with no way to tell afterwards
which rows are wrong. The text itself is `src/legal/terms.tr.md`, marked as a draft: it has
not been read by a lawyer (Q2).

#### 1.5 — phone verification

`SmsSender` port, log adapter. Six digits, five minutes, five attempts, sixty seconds between
codes, stored hashed. The `12` §Verification gates table is implemented as data in
`domain/verification-gates.ts`, with `emailVerifiedAt`/`phoneVerifiedAt` already on `User`, so
Phases 4 to 6 arrive already gated instead of each one remembering.

**The first version of that table was wrong in the direction nobody checks.** It required
email *and* phone for requesting offers and for contact disclosure. `12` says email for the
first and phone for the second, and the difference is not pedantic: requiring a phone to
request an offer would block every customer for as long as Q3 leaves the SMS provider
undecided — a missing decision turned into an outage, which is the failure mode Q10 was
written to avoid. The table now transcribes `12` verbatim and marks its four additions
(sign-in, company creation, invitations, reviews) as judgement.

#### 1.6 — companies and membership

Creation makes the creator `OWNER` and the company `PENDING`. The partial unique index
`CompanyMembership_one_owner_per_company` surfaces as `CONFLICT`, not a 500 — an unrecognised
constraint code is re-thrown rather than swallowed, so a real bug does not become a quiet 409.
Granting `OWNER` is a *transfer*: the current owner is demoted in the same transaction, so
there is never a moment with two.

`ADMIN` can neither grant nor take `OWNER` — proven from all three directions (self-promotion,
demoting the owner, removing the owner).

**Role change and membership revocation take effect on the next request**, proven by driving
`resolveActor` and the real `loadMembership` rather than rebuilding an actor object. Nothing
writes a role into a token; that is what `companyId`'s absence from the JWT buys. A
`SUSPENDED` company drops every member to read-only immediately, including the owner, who
cannot invite.

#### ADR-016 — and the two ways task 1.6 disagreed with `02`

Writing the service surfaced two decisions nobody had made, and both are recorded rather than
coded around.

With `member.invite` classified `write`, a freshly registered company is **one person** until
an administrator verifies it: the founder must personally scan the tax certificate. In a real
firm the person who registers the company is not the person who does the paperwork. Member
management is now `onboarding`. `REJECTED` and `SUSPENDED` are untouched — neither permits
onboarding work, so a frozen company still cannot change who its members are.

And `02`'s catalogue had no permission for *reading* the roster, so `listMembers` used
`member.invite` — meaning a `SALES` user could answer a customer request but not see the
colleague to hand it to. `company:member.read` is added, `read`, held by all four roles. Same
omission as `document.upload`, same resolution: the catalogue in code is the source of truth,
`02`'s table is generated from it, and a disagreement is an ADR plus a regenerated table.

#### 1.9 — audit and abuse

`AuditLog` rows for `login`, `login_failed`, `password_reset` and `session_revoked`, each with
IP and user agent. A login against an address with no account writes **nothing** — there is no
user to attribute it to, and a row keyed on the attempted address would make the audit log the
account-enumeration oracle that the login response is careful not to be.

Progressive delay (1/2/4/8s, capped, after five failures) with a lockout notice mailed **once
per streak**, because five emails in five seconds is itself the attack.

Session list with device and address, individual and bulk revoke. Ownership is in the `where`
clause: revoking somebody else's family matches nothing and answers `NOT_FOUND`, which is the
same answer a family that never existed gets.

**Rate limits from `06`, in Postgres.** `23` §Runtime runs the web tier as N stateless
instances, so a per-process counter would hand an attacker N times the limit and forget
everything on deploy — a limit that looks present and is not. `05` §Jobs rules out Redis for
V1, so the shared store is the database that is already there. Fixed windows, one upsert, no
read first. Both dimensions are consumed even when the first already refused, so spreading
attempts across accounts still fills the IP bucket. The known cost is the window boundary; the
per-account progressive delay is what actually makes guessing expensive.

`RateLimitHit` is a new table, added to migration 2 rather than a third migration
(`ADR-014`: one migration per phase). The local development database was reset with the user's
explicit consent to pick it up.

#### Carried forward, explicitly

- **Q10 — CAPTCHA. No enforcement, and this is not an oversight.** `12` §Abuse controls calls
  for a challenge after ten failed logins from one IP; no provider is named, and every
  candidate sends visitor data to a third party, which under `19` is a processor relationship
  needing a named purpose in the privacy notice and an agreement behind it. That is a decision,
  not an implementation detail. `noopCaptchaProvider` reports `enforcing: false` and login
  **proceeds** past ten failures rather than locking the account out: a missing decision must
  not become an outage. The port, the call site and the counter are all built — the day a
  provider is chosen, it is one adapter.
- **Q3 — SMS provider.** Task 1.5 closes on the log adapter, which is what the row asked for;
  the *question* stays open and now blocks Phase 6 disclosure rather than Phase 1. It is
  downstream of Q2 (İYS registration needs the legal entity) and Q2 is downstream of Q1.
- **Q1 — brand.** Still the literal `{brand}` placeholder. Mail now reads it from the same
  message catalogue the UI does, so there is one place to change and not two.
- **Auth.js wiring.** Still deferred. `identifyFromRequest` reads the `Session` table directly.
  The auth screens call the services through actions and route handlers; no provider
  configuration was needed to close 1.4, and adding one speculatively would be a second
  session mechanism to keep in step with the first.
- **A note for whoever runs the e2e suite twice in fifteen minutes.** Rate-limit rows persist,
  so the spec randomises its `x-forwarded-for` per run. Without that the second run fails on a
  limit the first one filled, and it looks exactly like a broken registration screen.
- **Locale negotiation.** `localePrefix: 'as-needed'` makes `/kayit` the Turkish route, but
  next-intl also negotiates on `Accept-Language`, so an English-configured browser asking for
  `/kayit` is redirected to `/en/kayit`. That is next-intl's documented default and it is
  probably right; it is written down here because it surprised this build's own test suite,
  and a Turkish marketplace may want to reconsider it before launch.


### 2026-08-16 — Phase 2 tasks 2.1, 2.2, 2.6, 2.7 (commit `P2.1+2.2+2.6+2.7`)

The catalogue schema, the admin CRUD over it, the admin navigation and the `PlatformSetting`
surface. Phase 2 row is now **🟡 in progress · 4/7**; 2.3 (real catalogue content), 2.4
(verification queue) and 2.5 (audit viewer) are the second half.

#### Three document contradictions, resolved in the documents

**Ç1 — one slug or one per locale? `ADR-017`.** `04` §Catalogue said
`Category(slug unique)`; `07` §Route map said *"`en` uses its own slug set"*. `07` wins:
there is no `slug` column on `Category` or `Product`, the slug is on the translation row, and
uniqueness is `(locale, slug)`. A single slug would put a Turkish word in every English
canonical URL, which is the one thing `18-cms-seo.md` exists to prevent. `07`'s phrasing
*"stored on the entity"* also permits `slugTr`/`slugEn` columns; that reading is rejected in
the ADR, because it makes a third locale a migration rather than a row.

**Ç2 — the `showIf` columns. No new ADR; `ADR-008` amended and `04` corrected.** There was no
decision to make. `10` §What V1 builds and `ADR-008` both already describe single-level
conditionality; `04` §Catalogue simply omitted `showIfAttributeKey` / `showIfValue` from
`ProductAttribute`. Inventing an ADR for a transcription error would make the log harder to
read, so the columns went in the schema and the omission is recorded as an amendment on the
ADR that depends on them — worth recording because it was load-bearing: without those columns
the only way to express "show the motor brand when motorised is true" is the rules engine
`ADR-008` declines to build.

**Ç3 — locale negotiation. `ADR-018`.** `localeDetection: false`. `/` and every unprefixed
path is Turkish for everybody; `en` is an explicit choice that the `NEXT_LOCALE` cookie then
remembers. next-intl negotiated on `Accept-Language` by default, which sent every
English-configured browser — common in this audience — from a Turkish URL to the English
site, and made an unprefixed path mean two different pages to two different crawlers, which
`18` §Canonical cannot express in an `hreflang` pair.

#### Verified on this machine

| Check | Result |
|---|---|
| `pnpm test` | **847 passed** (was 803) |
| `pnpm test:integration` | **155 passed** (was 124) |
| `pnpm test:e2e` | **30 passed, 20 skipped, 0 failed** (was 22) |
| `pnpm build` with `.env` moved aside | exit 0 |
| `pnpm lint`, `pnpm typecheck` | clean |
| `prisma migrate diff --from-migrations --to-schema --exit-code` | `No difference detected`, exit 0 |
| migration 3 applied | 8 catalogue tables + `Seo`; `CompanyProduct` absent, asserted |
| authorisation matrix | 35 registered methods, 0 unregistered; catalogue and settings all `admin` |
| referenced option delete | `PRECONDITION`, names the count, tells the admin to deactivate |
| deferred screens in navigation | 0, asserted from both directions and against `07` itself |
| `band_percent = 900` | refused, and the refusal carries the reason |
| a11y with each overlay open | 6 routes, 0 violations |

#### 2.1 — migration 3

`Category`, `Product`, `ProductAttribute`, `ProductOption`, their four translation tables and
`Seo`. `CompanyProduct` / `CompanyProductOption` are **not** in it — they are the
manufacturer's offer over the catalogue and they belong to Phase 3. The migration-scope test
asserts their absence, because the boundary between "what the platform sells" and "who sells
it" is the whole reason task 2.1 stops where it does.

Turkish collation on the three columns a human sorts by (`CategoryTranslation.name`,
`ProductTranslation.name`, `ProductOptionTranslation.label`) and **deliberately not on the
slugs**: a slug is an identifier that must compare exactly, and a Turkish collation would make
`İ`/`ı` locale-dependent inside a uniqueness index. Both halves are asserted.

#### 2.2 — the CRUD, and rules with nothing to protect yet

`modules/catalog/` follows the `iam` template exactly: `domain/` pure, `application/`
returning `Result`, every method through `serviceMethod()`, both adapters over one Zod
schema. Fifteen methods, all `{ kind: 'admin' }` — asserted, because the catalogue is the
public face of the platform and a verified manufacturer's OWNER must not be able to edit what
the platform sells.

The rules from `10` §Admin authoring are enforced now, while **nothing can violate them**.
There is not one `Project` row in the database, so an admin could delete any option today and
nothing would break. That is precisely the argument for doing it now: discovered in Phase 4,
"we deleted the option that project referenced" is data loss with no recovery, because a
`PriceCalculation.breakdown` naming an option that no longer exists cannot be reconstructed.

The reference check is written against `information_schema` rather than a Prisma model,
because `ProjectAttributeValue` and `PriceBookOptionPrice` do not exist yet. It reads zero
today and becomes correct the moment those tables land, with no change here — the alternative
is a `TODO` somebody has to find. The integration test creates a table of that exact shape and
proves the refusal fires.

`showIf` chains are refused **from both ends** — you cannot point at a conditional attribute,
and you cannot make an attribute conditional once something depends on it. Authoring order
should not decide whether a rule applies. Two levels is a dependency graph; a graph needs
cycle detection and evaluation order; and at that point `ADR-008`'s rules engine has been
built by accident.

Adding a required attribute is **allowed and reported**, not refused: `10` says it applies to
new projects only, so the service answers `impact: 'new-projects-only'`, the screen says so,
and the audit entry carries it as its reason.

#### 2.6 — navigation, and testing an absence

The `adminNav` was already correct. What was missing was anything stopping it from becoming
incorrect: `ADR-010`'s four deferred screens are absent, an absence has no code to review, and
nothing in a pull request shows that a link is still missing. `nav-items.test.ts` checks it
three ways — by name fragment, against an allow-list drawn from `07` §Route map, and by
reading `07` itself to confirm the four are still listed as deferred. If somebody adds a
placeholder page because the navigation "looks unfinished", they have to argue with the
document first.

The command center is now `17` §Command center's work queue rather than a placeholder card.
Two of the six queues have data (`Company.status = PENDING`, and the catalogue counts); the
other four render as **named and explicitly not-yet**. A zero and "this table does not exist"
look identical on a dashboard and mean opposite things, and the one that gets ignored is the
real zero.

#### 2.7 — settings with bounds, and the bounds with reasons

Every key in `domain/settings-catalogue.ts` carries a Zod schema, a unit, and a **stated
reason for its range**. `pricing.band_percent` caps at 50 because a band wider than half the
estimate tells the customer nothing; `matching.max_companies_per_project` caps at 10 because
above that a request is spray-and-pray and manufacturers learn to ignore leads. The rationale
travels with the refusal and is rendered next to the field — a bound with no stated reason is
the first thing somebody widens when a value is refused.

An unknown key is `NOT_FOUND`, not a new row. `PlatformSetting` is key-value, so nothing in
the database stops `pricing.band_percnt` from being created by a typo; it would then sit there
being read by nobody while the real setting keeps its old value, and the admin who "changed"
it has no way to tell.

Every write requires a reason and is audited with before and after (`17`).

#### Findings

**The `/dev/ui` gallery rendered triggers, not overlays — and that is why the 48-pixel dialog
survived Phase 0.** Fixed by opening one overlay per page load from `?overlay=`, with all six
in the a11y sweep. Two of them then failed axe with nineteen `aria-hidden-focus` violations
each: Radix's `DropdownMenu` and `Select` are modal, so opening one puts `aria-hidden` on
everything else, and this page deliberately renders forty focusable widgets at once. That is a
fact about the gallery, not the menu, so the overlay routes scan the portal and exclude
`main`; `/dev/ui` with nothing open is still scanned whole. Each overlay route asserts its
role is visible **before** scanning — an axe run against an empty portal passes, and a green
run measuring nothing would be worse than the bug it was added to catch.

**Prisma refuses a create that mixes a scalar foreign key with a nested relation write.**
`{ parentId, seo: { create } }` does not typecheck: the checked and unchecked input shapes are
disjoint. The `Seo` row is created first and its id passed. Not a defect, but the error message
points at the whole `data` object and takes a while to read.

**Four Phase 1 routes did not match `07` §Route map.** `/sifre-sifirla` versus the table's
`/sifremi-unuttum`, flat `/eposta-dogrula` versus `/dogrulama/email` — and two routes Phase 1
needed were missing from the table entirely: the reset-completion step and a landable 403.
The table is corrected to what exists rather than the routes being renamed: the names are
equally arbitrary, and the omissions were the real defect. Worth recording because I
introduced the divergence in Phase 1 and did not notice it there.

**`/yonetim/ayarlar` is a route `07` did not have.** `17` §Platform settings specifies the
surface and names no screen, and `/bildirimler` is notification settings, which band width is
not. Added to the route map and to the navigation allow-list in the same change.

#### Carried forward

- **2.3, 2.4, 2.5** — the real catalogue content, the verification queue and the audit
  viewer. The audit *writer* is done: catalogue and setting writes produce entries with
  before/after, so the trail starts now rather than when somebody builds the viewer and
  discovers a hole exactly where the early mistakes are.
- **Q1, Q3, Q10** unchanged from Phase 1.
- **Q6 and Q7** are now editable rather than only seeded — `tax.kdv_default_percent` and
  `offer_request.sla_hours` can be tuned from the admin screen the day an accountant or real
  data answers them, with the change audited.
- **Category nesting is capped at one level**, which `04` does not state either way. `07`
  §Route map has `/kategoriler/[slug]`, not a path of arbitrary depth, and a tree nobody can
  render is a tree nobody maintains. Stated in the service; not worth an ADR unless a second
  level is ever asked for.


### 2026-08-16 — Phase 2 tasks 2.3, 2.4, 2.5 and the gate (commit `P2.3-2.5 · Faz 2 kapanışı`)

The seed catalogue, the verification queue and the audit viewer. Phase 2 row is now
**✅ gate met · 7/7**.

#### Two document debts, closed while they were still one line each

**`CmsPage` had a single `slug unique`** — `ADR-017`'s contradiction one table further along.
`07` §Route map gives the CMS pages Turkish canonical URLs and an English set beside them, so
one slug per page would put a Turkish word in every English CMS URL. `04` §Content is
corrected and `ADR-017` gained a **Scope** paragraph making the rule general: no `slug` on the
entity, `slug` on the translation row, `@@unique([locale, slug])`, for anything with a public
URL. Done now because `CmsPage` does not exist yet; after Phase 8 it is a migration over live
content with indexed URLs and a redirect map hanging off it.

**Category depth was only in a service.** `Category(parentId?)` describes a tree and `04`'s
contract did not bound it. `07` §Route map has `/kategoriler/[slug]` — one segment — so a
second level would have no URL to live at. One paragraph in `04`, and the column stays
self-referencing because that is still the right shape for one level.

#### Verified on this machine

| Check | Result |
|---|---|
| `pnpm test` | **864 passed** (was 847) |
| `pnpm test:integration` | **186 passed** (was 155) |
| `pnpm test:e2e` | **33 passed, 20 skipped, 0 failed** (was 30) |
| `pnpm build` with `.env` moved aside | exit 0 |
| `pnpm lint`, `pnpm typecheck` | clean |
| `prisma migrate diff --exit-code` | `No difference detected`, exit 0 |
| `pnpm seed` / `seed demo` / `seed e2e` | 3 categories, 7 products (2 fully specified), 19 attributes, 42 options |
| authorisation matrix | 44 registered methods, 0 unregistered; catalogue, settings, verification and audit all `admin` |
| Phase 2 gate e2e | green — product + attribute + option added, manufacturer verified, both in the audit trail |
| audit filters | every one lands on an index; the one that cannot is refused |

#### The gate

`21`: *"an admin adds a product and its options with no deployment, and verifies a
manufacturer."* `e2e/phase2-gate.spec.ts` does both against a production build.

It **provisions its own manufacturer** rather than verifying whichever `PENDING` company the
seed left lying around. That version works once: the second run finds the company already
`VERIFIED`. So the spec registers a founder, verifies the email, verifies the phone and
creates the company through `/api/v1`, then the admin reviews the documents and approves —
re-runnable on any profile, and it proves that whole path still works as a side effect.

Reading the OTP needed the SMS twin of the dev mailbox, so `/api/dev/outbox` now exists with
the same two guards (`APP_ENV` and the provider, and the env schema already refuses
`SMS_PROVIDER=log` in production). A third gate test asserts both endpoints report
`provider: log`, so the guard is watched rather than assumed.

#### 2.3 — the catalogue, and the part that is not code

Three categories, seven products — the seven `product_selection_step_1` shows — and **two of
them fully specified**: bioklimatik pergola and giyotin cam. The other five carry *no*
attributes at all rather than a few, because a half-specified product looks finished in a list
and becomes a surprise in Phase 4.

Giyotin cam was chosen over the alternatives for a reason worth recording:
`project_options_step_5` shows *zip perde* and *sürme cam* as options **on** the pergola, so
specifying either as a standalone product first would specify the same thing twice from two
directions. Kış bahçesi was the other candidate and was rejected as three specifications in a
trench coat — roof, walls and a thermal break — which from outside the trade would have been
exactly the invention this task is trying to avoid.

The Turkish is written, not translated, and a test pins the places where the trade term and a
literal translation differ: *çıkıntı* not *projeksiyon*, *duvara dayalı* not *duvara monte*,
*ısıcam* rather than *çift cam*, *giyotin* not *gilotin*.

`affectsPrice` is defined precisely rather than set to `true` by reflex: it marks an attribute
whose answer reaches `08` §Algorithm — **step 3** for choice attributes (each selected option
needs a `PriceBookOptionPrice` from the manufacturer) and **step 1 or 6** for numbers (the
basis, or a `SIZE_SURCHARGE` / `HEIGHT_SURCHARGE` threshold). Phase 5 reads it to know which
price-book rows a manufacturer must fill in.

#### `ADR-008` was tested, and it survived — with one reshape

`10` §What V1 builds claims *"every product in the seed catalogue is expressible as a flat
attribute set"*, and that sentence is the whole justification for not building a rules engine.
Until there was a catalogue it was a prediction.

**It held, but not on the first draft.** The first `giyotin-cam` had a `panel_sayisi`
attribute, and it did not work: the valid panel count depends on the opening width, which is a
*compatibility* rule between two attributes, and `showIf` only does visibility. `ADR-008`
names cross-option compatibility as out of V1, so the choice was to build the engine or
reshape the attribute.

Reshaped. Panel count is an engineering consequence of the opening, not a customer choice, so
the customer gives the opening and the manufacturer works out the panels — which is also what
actually happens when somebody orders one. The attribute is *gone* rather than constrained,
and `catalogue-data.test.ts` asserts it stays gone, so a future attribute that reintroduces a
compatibility rule fails there rather than in Phase 4.

Both products use exactly one level of `showIf` (`zip_kumas` on `yan_kapama`,
`motor_markasi` on `hareket_tipi`), validated through the *service's* `validateShowIf` rather
than a second copy of the rule.

**The finding to carry into Phase 4:** `showIf` handles visibility and nothing else. A
customer can still configure a combination a manufacturer would not build. That is tolerable
in V1 only because the output is an *estimate* the manufacturer corrects with a real offer
after a site survey (`ADR-006`, `11`) — if the product ever presents an estimate as binding,
`ADR-008` needs revisiting on that ground, not on this one.

#### 2.4 — verification

`PENDING` → `VERIFIED` | `REJECTED`, plus two actions `17` lists separately and that are
separate here: **request documents** does not change the status (rejecting somebody in order
to ask them a question is how a queue becomes adversarial) and **suspend** freezes an already
verified company.

Rejection needs a reason ≥ 10 characters, and the reason travels to the company verbatim —
`17` says it stays visible to both sides, so there is no internal-versus-external version to
keep in step. Approval clears the old rejection reason, because a verified company should not
be shown its rejection text forever.

The queue opens on `PENDING`. A work queue that opens on everything is a list.

`02` §Verification state is enforced at the service, and the tests assert the distinction that
is easy to lose: `REJECTED` keeps exactly one write permission — `document.upload`, which is
what "may resubmit" means in a permission catalogue — while `SUSPENDED` keeps none.

Every decision is audited and every decision is mailed. The notification catalogue is Phase 7;
one event per decision is the floor, and silence is not an acceptable placeholder for it.

#### 2.5 — the audit viewer

Read-only, and the matrix now has a test asserting no `audit.*` method starts with
`create`/`update`/`delete` — `17` makes the table append-only for everyone including admins,
and retention is a Phase 9 job rather than a button.

**Every filter lands on an index from `04` §Indexes**, and the one that cannot is refused:
`entityId` without `entityType` gets a `VALIDATION` error, because the index is
`(entityType, entityId, createdAt)` and an id alone is a sequential scan over the
fastest-growing table in the system. `04` §Conventions says a filter the index does not
support means adding the index in the same change; the honest answer here is that nobody
searches audit rows by a bare id they cannot type from memory, so the filter is refused rather
than indexed. A test reads `pg_indexes` and asserts all three indexes are actually on the
table, because the migration is what ships.

`before`/`after` are rendered as a **field-level diff** rather than two JSON blobs. The diff
is computed in the service so the screen and any future export agree on what "changed" means,
and an entry whose payloads are identical says so instead of showing nothing.

#### Findings

**The seed could not import the password hasher.** `infrastructure/password-hasher.ts` carries
`import 'server-only'`, which throws under `tsx` — and the seed needs to hash the bootstrap
admin's password, because Phase 1 built the credential flow and an admin with no password is
an admin the gate cannot sign in as. The Argon2 work factor moved to `domain/password.ts`,
where it belongs anyway: 19 MiB / t=2 / p=1 is a policy decision from `12` §Credentials, not
an implementation detail. One source for the numbers, and the guard stays on the module that
needs it.

**A `NUMBER` attribute with no bounds is invisible until Phase 4.** `10` §Validation reads
readiness bounds from `ProductAttribute.min`/`max`, so a numeric attribute without them cannot
be validated at all — and nothing in the schema requires them. The catalogue test now fails if
a `NUMBER` attribute is missing `unit`, `min`, `max` or `step`.

**Two things are called verification.** Phase 1's `verification.integration.test.ts` is email
verification; Phase 2's is company verification. The new file is
`company-verification.integration.test.ts` rather than a rename, because both names now say
which one they mean — the collision is a fact about the domain, not an accident.

#### Carried forward

- **Q11–Q18 are new, and they are the point of this task.** Everything provisional in the
  catalogue is written down as a question for the `26` §D3 pilot manufacturer rather than left
  looking decided. See §Open questions.
- **Document *viewing* is not yet audit-logged.** `17` §Manufacturer verification calls it a
  disclosure — these are legal identity documents. The review *decision* is logged; the
  fetch is not, because the storage surface that serves the file is Phase 3. It lands with
  the surface that can see the request.
- **No seeded product uses `LENGTH_M` or `UNIT`.** Everything in this market appears to be
  priced per m². Rather than invent a product to fill the enum, it is Q17.
- **Q1, Q3, Q10** unchanged from Phase 1.


### 2026-08-16 — Phase 3 tasks 3.1, 3.2, 3.6, 3.7 (commit `P3.1+3.2+3.6+3.7`)

The manufacturer supply side, minus the price book. Phase 3 row is now
**🟡 in progress · 4/8**; 3.3, 3.4, 3.5 and the pure pricing engine are the second half.

#### Three firsts, and what each one cost

**The first background job.** pg-boss on the same Postgres, in its own `pgboss` schema —
`ADR-014`'s "one migration per phase" is about *our* tables, and letting a self-migrating
queue into `public` would put a dozen of them into `migration-1`'s exact table list. `23`
§Runtime's second entrypoint now exists: `src/worker.ts`, same code, different command,
draining on `SIGTERM`.

Both jobs are idempotent **by shape rather than by a flag**: the geocode job is a pure
function of the row, and `media.process` upserts every variant on `(fileId, name)` with keys
derived from the original. The version that would look idempotent and is not — "skip if
`centerPoint` is already set" — passes a naive re-run test and silently ignores a
manufacturer correcting their district, so there is a test for that case specifically.

**The first real upload.** `StorageProvider` port, S3 adapter, presigned PUT straight to
MinIO. The server validates type, size and count **before** issuing the URL, and the URL is
pinned to the declared content-type *and* length — without the length pin it is a blank
cheque: the client declares 2 MB, the quota check passes, and 2 GB arrives.

**The first multi-module feature.** Placed by `05` §Shape: the company profile in `iam/`
(the same module already owns the company row, its memberships and its verification), the
product offer in `catalog/` (the rows are about the catalogue and every read joins it), and
service areas in `matching/` (a service area has exactly one reader, and it is the matching
filter).

#### Portfolio went into its own module, and here is the argument

`05` is silent, so: not `iam/`, which is identity and access and has nothing to do with a
photo gallery — letting it in is how an "iam" module ends up holding everything that hangs
off `Company`. Not `catalog/`, where every method is `admin` and the subject is what the
*platform* sells. Not `matching/`, even though `09` §Scoring reads portfolio depth for five
points out of a hundred — matching reads reviews, price books and service areas too, and
owning a table because you read it is how a module becomes everything.

So `modules/portfolio/`: company showcase content and its media, one writer, two readers
arriving later (the public profile in Phase 8, the score in Phase 5). It costs a directory,
which is the price `notification/` and `audit/` already paid for being small and about one
thing.

#### Q4, decided — `ADR-019`

**No geocoding provider in V1, and no map-tile vendor either.** The `Geocoder` port ships
with an administrative-centroid adapter over the 974 district centroids Phase 0 already
seeded, plus optional coordinates a manufacturer can type.

The argument is that a radius area says "we work within N kilometres of here", the
uncertainty that dominates is N, and `09` §Service-area coverage *already* accepts a district
centroid as the project's point when the customer gave none — calling it "good enough for a
radius test". Paying a provider to place one end of that comparison to within ten metres
while the other end is the middle of a district buys nothing measurable.

Q4 is **narrowed rather than closed**: the open question is now "does the public site need
map tiles in Phase 8, and does the picker come free with them". The adapter is called
`administrativeGeocoder` rather than `nullGeocoder` on purpose — it is a real geocoder with a
coarse resolution, and naming it after what it lacks invites replacing it before anybody finds
out whether the resolution is a problem. `precision` is stored and shown, so a manufacturer
can tell a centroid from a pin.

#### The carried-over debt is closed

`17` §Manufacturer verification calls document *viewing* a disclosure — these are legal
identity documents — and Phase 2 could only log the decision, because the surface serving the
file did not exist. It does now: `fileUrl` writes a `document_viewed` entry when it issues a
signed URL for a `COMPANY_DOCUMENT`.

**Logged on issuance, not on fetch.** The fetch goes straight to storage and never reaches
the application, so the URL is the thing we hand over and therefore the thing to record. A
portfolio photo writes nothing — logging every CDN image request would make the audit log
unreadable and prove nothing.

#### Verified on this machine

| Check | Result |
|---|---|
| `pnpm test` | **864 passed** |
| `pnpm test:integration` | **223 passed, 16 files** (was 186), real PostGIS + real MinIO, 205 s |
| `pnpm test:e2e` | **35 passed, 20 skipped, 0 failed** |
| `pnpm build` with `.env` moved aside | exit 0 |
| `pnpm lint`, `pnpm typecheck` | clean |
| `prisma migrate diff --exit-code` | `No difference detected`, exit 0 |
| `pnpm worker` | starts, creates both queues, reports ready |
| radius boundary | 39 km inside a 40 km radius matches; 41 km does not |
| job idempotency | both jobs, same result on the second run, same object keys |
| access classes | portfolio photo `public/` unsigned CDN; document `private/` signed 5 min |
| document viewing | `document_viewed` audit entry with actor and IP |
| authorisation matrix | 64 registered methods, 0 unregistered |
| integration harness | one container per run, one `migrate deploy`; setup 7.9 s total, was ~150 s per file |

#### Findings

**The web tier ran on ten database connections, and the end-to-end suite is what found it.**
`createAdapter` built `PrismaPg` with no `max`, so every Next process used `pg`'s default
pool of ten. A server action that verifies a password holds its connection for the whole
Argon2 hash — 19 MiB, t=2 — and three Playwright specs running in parallel against one server
were enough to exhaust it. The symptom was not slowness: it was
`Application error: a server-side exception has occurred` on `/sifre-yenile`, a page that
passes every time on its own. This was a **production defect**, not a test artefact; ten
concurrent sign-ins would have done the same to real users. `POOL_SIZE = 20` now, with the
note that the answer to sustained load is a pooler in front of Postgres rather than a larger
pool in every process.

**The integration harness started sixteen containers while claiming to start one.** The
config said *"One container, shared by the files"*; the container was created in
`setupFiles`, which Vitest evaluates once per **test file**. Sixteen files meant sixteen
PostGIS boots and sixteen `migrate deploy` runs, ~123 s of prologue each, a half-hour run —
and enough Docker churn that *different* files failed on each run, including `tokens` and
`company-verification`, which nothing in this phase touches. Flakiness that moves between
runs is a property of the harness. The container moved to a real `globalSetup`, which runs
once in Vitest's own process and hands the URL to the workers through `provide`.

Worth saying plainly: **two full runs were red for this reason and the failures looked like
Phase 3 regressions.** Chasing them as regressions would have been wasted; what distinguished
them was that the set of failing files changed and included files no recent commit touched.

**A test declared 40 bytes for a 26-byte upload, and storage refused it — correctly.** The
presigned URL pins `ContentLength`, so a body that does not match the declaration is rejected
before a byte is stored. The `PENDING`-company test hardcoded a round `sizeBytes` next to a
literal PDF fragment and the two drifted. The pin is exactly the protection `14` asks for
against a client that declares 2 MB and uploads 2 GB; this is the only evidence in the suite
that it actually engages, so the fixture now derives its length and says why.

**The matrix scan caught the job handlers, and it was right.** `runGeocodeServiceArea` and
`runMediaProcess` were exported from `application/` with no `serviceMethod` entry. A job
handler takes no `ActorContext`, asserts no permission and returns no `Result`, so it is not
an application service however much it orchestrates — both moved to `infrastructure/`,
following the precedent `audit/infrastructure/audit-log.ts` already set. No exemption was
added; the scan stayed exactly as strict.

**The matrix's "everything in `catalog` is admin" rule became wrong this phase.** True in
Phase 2, and it would now have made `setCompanyProduct` admin-only — a manufacturer unable to
say what they sell. The test names the company-owned three explicitly and asserts *both*
directions, so neither list can quietly swallow the other.

**`server-only` broke the worker, as it broke the seed in Phase 2.** The fix this time is
`--conditions=react-server`: that is the condition under which the marker package resolves to
an empty module, Next sets it, and plain Node does not. It is honest rather than a bypass — a
worker *is* a server. The same script needs `--env-file-if-exists=.env`, because Next loads
`.env` for the web tier and nothing loads it for a standalone process.

**pg-boss's `singletonKey` does nothing without a queue policy.** The first version
deduplicated nothing and the test caught it; `createQueue(name, { policy: 'stately' })` is
what makes one job per key in each state true. Queue creation moved into `ensureQueues()` so
the worker and the tests cannot configure it differently.

**A hardcoded base64 PNG in a test was not a valid PNG**, and the suite failed with
`vipspng: libpng read error` from inside the job — which reads as a bug in the pipeline
rather than a bug in the fixture. The fixture is now rendered by `sharp` itself.

**A non-breaking space inside a JSX string literal** survived two attempts to replace it and
does not show in a diff. Worth knowing that `cat -A` is the way to see it.

**A `PENDING` company cannot build a portfolio, and that is correct** — `portfolio.manage` is
`write` and `02` §Verification state gives a pending company only the onboarding path. It is
recorded because the first draft of the test assumed otherwise and because the two states are
easy to conflate: documents *do* work while pending (`ADR-016`), and that is the whole reason
they are classified differently.

#### Carried forward

- **There is no virus scanner.** `14` §Virus scanning gates serving on `virusScanStatus` and
  that gate is built and enforced — nothing is served to anyone but its uploader until
  `CLEAN`. What is missing is the thing that *decides* `CLEAN`, which is a ClamAV sidecar or
  a provider API and therefore an infrastructure decision. `scan()` returns `CLEAN`
  unconditionally; leaving everything `PENDING` instead would mean no image is ever visible
  and would be discovered as "images are broken". New question **Q19**.
- **SVG logos are rejected rather than sanitised.** `14` allows SVG *if* it is sanitised
  server-side; no sanitiser is built, and an unsanitised SVG is a stored-XSS vector. Rejecting
  is the honest V1 answer. Part of **Q19**.
- **`node dist/worker.js` has no build step.** `23` §Runtime specifies it; there is no
  Dockerfile and no bundler configured for the worker. Inventing one for an image nobody
  builds would be guessing at Phase 9. New question **Q20**.
- **Portfolio photos render with a plain `<img>`.** `14` asks for `next/image`, whose remote
  pattern needs the CDN host at *build* time — the Phase 8 decision nobody has made, and
  reading `CDN_BASE_URL` into the build is what non-negotiable 9 forbids. The variants are
  rendered and the smallest is served, so the bandwidth half is answered; the optimiser
  arrives with the host.
- **Deleting a portfolio item leaves its objects.** `14` §Retention marks files and a nightly
  job removes the objects after seven days; that job is Phase 9. The rows go, the objects
  stay — which is the correct half to build first, since the reverse is unrecoverable.
- **The manufacturer navigation still points at `/panel/...` without a company id.** The four
  new pages live at `/panel/[companyId]/...` per `07` §Route map; `PortalShell` has no company
  in scope to prefix with. It needs a company switcher, which belongs with the dashboard in
  the second half.
- **Q1, Q3, Q10, Q11–Q18** unchanged.

### 2026-08-16 — Phase 3 tasks 3.3, 3.4, 3.5, the pricing engine and the gate (commit `P3.3-3.5 · Faz 3 kapanışı`)

The pure engine first and on its own, then the lifecycle around it, then the screen, then the
simulator. A verified company can now publish a price book, so a company is **matchable**:
products, service areas and a live price book that produces a real number.

#### The engine is pure, and that bought something concrete

`modules/pricing/domain/engine.ts` imports `shared/money` and nothing else — no database, no
clock, no randomness. 30 unit tests and 13 golden files run in **two seconds** with no
container, which is why every rounding boundary and every option mode could be covered rather
than sampled. The application service loads the inputs, calls it, and persists.

Two design points are load-bearing and are asserted rather than commented:

- **Rules are additive against the subtotal.** A test permutes all four rules through all 24
  orderings and asserts one net. Compounding rules are how price engines stop being
  explainable, and the property is now something a future change breaks loudly.
- **The floor applies last.** A case drives base ₺2 000 through a 50% discount and a −₺500
  regional adjustment to a pre-floor ₺500, and asserts ₺1 500 out. Applied at step 5 it would
  have produced ₺500 — the minimum a manufacturer said they would accept, discounted away.

#### Golden files, and how a bump is actually enforced

13 fixtures, typed in TypeScript with their expectations committed as JSON — the compiler
catches a fixture naming a mode that does not exist, and a reviewer reads a diff of real money
rather than a re-recorded snapshot. They cover all three documented outcomes, not only the
happy one: `priced`, `price-on-request` and `unpriceable`.

Enforcement is a checksum recorded per `ENGINE_VERSION`. Changing any expectation without
bumping fails with a message naming both halves of the fix. **Proven by tampering**: adding
one kuruş to a golden failed two tests — the regression and the checksum gate — and both
passed again on revert.

Honest about the limit, and it is written in the file: nothing inside one file stops somebody
editing a past version's checksum along with the goldens. What it guarantees is that the
change cannot be *accidental*.

#### `20` §Unit asks for a property that is not true — `ADR-020`

*"net is monotonic in area"* fails on a configuration the engine handles correctly: ₺100/m²
with 10% off above 100 m² makes 100 m² (₺9 000) cheaper than 99 m² (₺9 900). Three ways out
were available — drop threshold rules, make discounts marginal-only, or scope the property.

Scoping it, plus a diagnostic. The engine property covers rule-free books, where monotonicity
is arithmetic. `inspectPriceBook` sweeps a book across basis values and reports an inversion
**to its owner, in the simulator, before publishing** — along with a rule that never fires
(almost always a unit mix-up) and a floor that swallows the whole range. Marginal-only
discounts are what a pricing theorist would pick, and they are not what `08` §Algorithm
describes; choosing them here would mean the engine quietly disagreeing with its own
specification.

#### The editor, and the four decisions that make it usable

`26` §Risk register puts the largest risk in the project on this screen. Five option modes ×
regional adjustments × four rule kinds is a form somebody abandons, so:

- **You never start from nothing.** The draft is seeded from the products and options the
  company already declared in 3.2. First screen is their own catalogue with empty price
  fields.
- **Cloning is a button, not a menu item.** `08` §Versioning makes editing a published book
  *mean* cloning it, so every price book after the first is made that way. There is a clone
  button per version, and the empty state is a row of them.
- **Money is typed in lira.** `ADR-005` is about storage. Asking a human to type 450000 for
  ₺4 500 is how a price book ends up out by a factor of a hundred.
- **The simulator sits beside the form**, not behind a tab, and saves before it runs —
  simulating unsaved state would tell a manufacturer their edits are fine and then publish
  something else.

Rule thresholds are labelled **per kind**, because "40" means 40 m², ₺40 and 40 m in three
different rules.

#### Immutability, proven against a real database

`20` §Integration asks for one assertion by name: *publishing v2 does not alter any stored
`PriceCalculation`.* A calculation is written at ₺1 000/m², v2 is published at ₺2 000/m², and
the stored row still reads ₺20 000 against v1 — with a fresh calculation at ₺40 000 to prove
the publish worked and the test is not passing on a broken one.

"One live book per company" is a **partial unique index**, not a service check. A service
check loses to two tabs; the test asserts the raw insert is rejected by Postgres.

#### The disclosure boundary is a type

`ADR-006` item 2 — *the customer sees a band, never line items* — is now a compile error
rather than a review note. `NoLineItems<T>` maps any property named like a breakdown, a line
item or an internal amount to `never`, and `EstimateBand` takes `CustomerEstimate`. The
assertions run in `pnpm typecheck`, which is a pipeline stage, so the rule is enforced before
anything executes. `OwnerEstimate` is structurally incompatible, so a handler cannot return
the wrong one from a shared path.

`EstimateBand` itself is built three phases before a customer surface exists, which is
`22` §Patterns' point: the rules are decided once, while there is nothing to retrofit. All
four states are in `/dev/ui`, so the a11y sweep covers them.

#### Both corrections

**`next/image` is back.** Non-negotiable 9's scope is `src/app`; `next.config.ts` is the
build configuration, is evaluated once, and `CDN_BASE_URL` is a public hostname. It is read
from `process.env` directly rather than through the typed env — that module parses the
*whole* environment and throws on the first missing secret, which is exactly the
build-needs-production-secrets failure `23` §Configuration removed. An unset host falls back
to the local MinIO origin, so CI's no-`.env` build still succeeds. `imageSizes` matches the
ladder `media.process` already renders, so the optimiser and the job do not each invent
widths.

**The company switcher.** `manufacturerNav` now holds path *suffixes* and
`manufacturerNavHref` joins them, so a link without a company id cannot be constructed.
Switching company is a **navigation** — the same path re-entered under a different id — which
is what makes `12` §Context resolution's two-tabs case work. A single company renders as text
rather than a one-option dropdown.

#### Verified on this machine

| Check | Result |
|---|---|
| `pnpm test` | **926 passed**, 23 files |
| `pnpm test:integration` | **235 passed**, 17 files, real PostGIS + real MinIO |
| `pnpm test:e2e` | **37 passed, 20 skipped, 0 failed** |
| `pnpm build` with `.env` moved aside | exit 0 |
| `pnpm lint`, `pnpm typecheck`, `pnpm format` | clean |
| `prisma migrate diff --exit-code` | `No difference detected`, exit 0 |
| golden bump enforcement | tampering with one golden fails two tests; revert restores both |
| rule permutation | 24 orderings, one net |
| floor last | pre-floor ₺500 → net ₺1 500 |
| v2 publish | stored calculation unchanged; fresh one picks up v2 |
| one live book | raw second `PUBLISHED` insert rejected by the index |
| simulator | draft book, full breakdown, no `PriceCalculation` written |
| `EstimateBand` | cannot carry a line item — `tsc` |
| Phase 3 gate e2e | offer → draft → simulate → publish → matchable |
| authorisation matrix | 74 registered methods, 0 unregistered |

#### Findings

**The authorisation-matrix scan caught two things, and was right about both.** `bandSettings`
was an exported helper in `application/` that takes no actor and asserts nothing — moved to
`infrastructure/`, following the precedent the job handlers set in the first half. And the
scan tried to *import* a `.test.ts` file sitting beside a service, which ran its `describe`
inside the running test; vitest refuses that, rightly. The walker now skips test files. No
exemption was added in either case.

**The shared integration container turned a latent test coupling into a real failure — and
that is an improvement.** `migration-1` creates a fixture city with `plateCode: 34`, which is
unique and which `geo-seed` commits as the real İstanbul. Until the first half of this phase
every test file got its own container, so the collision could not happen; one container per
*run* means committed rows from one file are visible to the next. The fixture moved to the 9xx
range the other suites already use — and the point is that the coupling was always there,
hidden behind sixteen containers.

It failed **only in the full run**, passing in isolation, which is the signature worth
remembering: a suite that passes alone and fails together is telling you about shared state,
not about the code under test.

**A page in the first half calls Prisma directly from `app/`.**
`hizmet-bolgeleri/page.tsx` does `prisma.city.findMany` through a dynamic import — which
non-negotiable 2 forbids and which the lint rule does not catch, because the rule looks at
static imports. The pricing page needed the same data; rather than copy the violation it got
`matching.listCities`. **The existing violation is still there** — carried forward below.

**`i18n`'s "the two locales must differ" test flagged the estimate range.** `{low} – {high}`
is identical in `tr` and `en` because it is punctuation around two numbers the formatter has
already localised; a different one would mean one of them was wrong. Named as an exception
beside the phone placeholder rather than pattern-matched away.

**Two icons in the design do not exist in the icon set.** `calculate` and `history` are in
`manufacturer_pricing_management`; the typed `IconName` union refused them at compile time,
which is the union doing its job. Substituted rather than added, because adding an icon is a
design-system change and this was a screen.

#### Carried forward

- **`hizmet-bolgeleri/page.tsx` violates non-negotiable 2**, and the lint rule cannot see it
  because the import is dynamic. Two fixes are needed and neither is this phase's scope:
  switch that page to `matching.listCities`, and extend the boundary rule to dynamic
  `import('@/shared/db')` inside `src/app`. New question **Q21**.
- **`priceOnRequest` has a column and a DTO path but no screen.** `ADR-006` item 4 and
  `PRC-06` are honoured by the type and by `toCustomerEstimate`; the toggle belongs on the
  company settings screen and there was no customer surface to make it visible on. Phase 5.
- **Regional adjustments are city-only in the editor.** The schema, the engine and the tests
  all handle a district row and district-overrides-city; the *screen* offers provinces,
  because 974 districts in a dropdown is a worse answer than none until somebody asks for it.
- **`estimateForProject` writes a `PriceCalculation` but nothing calls it yet.** It is
  Phase 5's entry point, built here because the anti-scraping columns and the append-only rule
  are pricing's business rather than matching's. Covered by the immutability suite.
- **No market aggregate.** `ADR-006` item 6 puts min/max/median in
  `super_admin_market_pricing_dashboard` only. The `PriceCalculation` rows it reads now exist;
  the dashboard is Phase 7.
- **The golden checksum cannot stop a determined edit** — see above. It stops an accidental
  one.
- **Q1, Q3, Q10, Q11–Q20** unchanged. **Q11–Q18 are now answerable** — `27-d3-pilot-guide.md`
  phrases each as a question and the pilot account is seeded.

### 2026-08-16 — Phase 4 in progress · interim checkpoint (commit `P4 wip · sihirbaz iskeleti`)

**Not a finished half.** This entry exists so a fresh session does not have to re-derive the
decisions below from the diff. The tree is green — 932 unit tests, lint, typecheck — and the
commit is a safety point, not a deliverable.

#### Done

- **Q21 closed and generalised.** `no-restricted-imports` cannot see `await import(...)`, so
  three phases of layering violations were invisible. Four were found:
  `hizmet-bolgeleri/page.tsx` and `yonetim/page.tsx` (both counted rows straight off Prisma
  from `app/`), and the two `/api/dev` routes (reached `notification/infrastructure`).
  Layering bans now also match `ImportExpression`; **non-negotiable 9's group deliberately
  does not**, because there a dynamic import is the prescribed fix. Two-way fixtures prove
  static fails, dynamic fails, and rule 9's legitimate dynamic import still passes.
  Documented hole: a computed specifier (`import(someVariable)`) cannot be matched.
- **`shared/dev-outbox`** — the dev mailbox/outbox buffer moved out of `notification` rather
  than being exempted. It was duplicated across both adapters; one implementation now, and
  `app/` imports `shared/` legitimately. Zero exemptions still holds.
- **`kind: 'customer-owned'`** in the service registry, the third ownership shape.
  **No `PROJECT_*` permissions** — `02` §Customer permissions is explicit that a customer needs
  none. `scopedBy: ['userId', 'anonymousKey']` carries both identities from the start so 4.5
  needs no reshaping. Its claim differs from the company-scoped one: wrong customer →
  `NOT_FOUND`, not `FORBIDDEN`, because ownership is in the `where` clause.
- **Migration 6**: `Project`, `ProjectAttributeValue`, `ProjectAttachment`; a CHECK constraint
  for `04`'s "exactly one of `customerId` / `anonymousKey`"; GiST on `point` plus btree
  `(customerId, status)` and `anonymousKey`; Turkish collation. `Project` was already in
  `SOFT_DELETE_MODELS` from Phase 0.
- **`pointPrecision`** added to `04` §Project and migration 6 (regenerated, not supplemented —
  `ADR-014` holds). The point is resolved **when the location step is saved**, from the pin or
  the district centroid. Resolving at match time instead would make `ST_DWithin(..., NULL, ...)`
  return `NULL` and GiST skip the row: every radius area silently misses, symptom "no
  results", cause invisible until Phase 5.
- **Domain**: `steps.ts` (three stages / ten steps as data, per-step Zod schemas, derived
  area — no schema accepts `areaM2`), `readiness.ts` (every issue carries its step *and*
  stage; a hidden attribute is never required), `status.ts`, and `isAttributeVisible` placed
  beside `validateShowIf` so `showIf` has one home.
- **`status.ts` fixed two review-found bugs at the cause.** Status was written from two sites
  with two guards that had drifted: validating a `SUBMITTED` project reported `READY` while
  the database said otherwise, and validating a `CLOSED` one resurrected it. One transition
  function now, and `validate` returns the **persisted** status.
- **`ADR-021`** — the configurator is public. `07` had it at `/hesap/projeler/yeni` under an
  auth-gated segment while `10` §Anonymous drafts says a visitor configures without an
  account. Moved to `/proje/yeni` → `/proje/[id]`. Keeping the URL and exempting it from the
  gate was rejected: a path under `/hesap` that needs no account lies to the reader and to the
  middleware matcher.
- **`(public-owner)` route group**, and this is the part worth not re-deriving. `ADR-021`
  inherited a second contradiction: `07` §Rendering strategy calls `(public)` ISR-cacheable,
  and the configurator carries personal data. `noindex` does not help — it governs indexing,
  not caching. A segment-level `revalidate`, or a Phase 8 ISR sweep assuming `(public)` is
  safe, would serve one customer's project to another. The split is now a **route group whose
  layout sets `force-dynamic`**, and `scripts/check-dynamic-routes.mjs` enumerates that
  directory against Next's real `prerender-manifest.json` — not a list of route names, which
  the second half would outgrow the moment it adds `POST /claim`.
- Services: `project.{createProject,getProject,patchStep,validateProject}`,
  `catalog.listConfigurableProducts` (`anonymous` by design, `why` names `ADR-021`),
  `matching.listCities` / `listDistricts`, `platform.dashboardCounts`. Actions in
  `app/actions/project.ts`. `WizardStepper` and `ProductChooser`.
- Matrix extended: the four project methods assert `customer-owned` **and** both identities;
  `catalog` gained a third category (public read) asserted in both directions.

#### Not done — the rest of the half

`/proje/[id]` wizard page and its step forms; `/api/v1` route handlers; the `/dev/ui` gallery
entry for `WizardStepper` (**all three stages across completed/current/upcoming**, not one
snapshot); unit tests for `steps` and `readiness` and for both callers of
`isAttributeVisible` agreeing; integration tests (soft-delete proof, the point-resolution
pair, wrong customer → `NOT_FOUND`); wiring `check-dynamic-routes.mjs` into the build stage;
`core-flow`'s first two steps un-skipped — **with the URL updated to `/proje/yeni`**, because
they were written before `ADR-021` and a skipped test can carry a stale URL for years.

#### Findings so far

**`yonetim/page.tsx` had been reading Prisma from `app/` since Phase 2.** Not cunning — nobody
had looked, and no rule could see it.

**The "everything in `catalog` is admin" matrix rule needed a third category**, exactly as it
needed a second in Phase 3. Public reads are now named explicitly and asserted to be reads.

**Regenerating a migration with a hand-written tail duplicates statements.** Reassembling
migration 6 left a second `ProjectAttachment_fileId_fkey`; caught and removed, worth knowing.

### 2026-08-17 — Phase 4 tasks 4.1, 4.2, 4.3, 4.4, 4.7 (commit `P4.1-4.4+4.7`)

The configurator's first half. A signed-in customer walks the wizard, every step writes to the
database, and closing the browser loses nothing — the release gate's step 2 asserts exactly
that and now runs.

The interim checkpoint entry above covers the first two thirds of this work; this closes it.

#### The wizard

`ADR-013`'s three stages over ten logical steps, with `STEP_STAGE` in `domain/steps.ts` as
the single mapping — the stepper and the form both read it, so moving a step between stages is
one edit. Per-step Zod schemas, every field optional, because a draft is allowed to be invalid
and a customer must be able to leave the wizard without finishing it.

Three things the screens show that V1 does not: option prices (per manufacturer, none chosen —
`ADR-006`), attachments (4.6, second half) and the ten-step progress bar (`ADR-013`).

**Area is derived and cannot be typed.** No step schema has an `areaM2` field, so there is no
request shape that carries one; an integration test sends `areaM2: 999` alongside 5 m × 4 m and
gets 20 back. `10` §Field specifics wanted this because a typed area disagreeing with the
dimensions is a support ticket.

#### Readiness, and the step every issue carries

`POST /projects/{id}/validate` returns `{ ready, issues[] }` with each issue tagged with its
step **and** stage, so the summary links straight to the offending field. `10` §Validation asks
for it, and it is painful to retrofit — by the time the UI wants it the issues have been
flattened into strings at six call sites.

A hidden attribute is never required. Demanding an answer to a question that was never on
screen is the most confusing failure a form can produce, and `isAttributeVisible` — placed
beside `validateShowIf` so `showIf` has one home — is called by both the wizard and the
readiness check. A unit test asserts they agree across five answer sets.

#### Q18's single read point

Bounds are global today; the schema cannot express a regional one. `dimensionBounds()` is the
only place that decides, and it already takes a `BoundsContext` carrying the city and district
that nothing reads — so a caller cannot forget to pass them when the pilot answers. A test
asserts the context makes no difference *today*, which is the assumption stated as code.

#### Verified on this machine

| Check | Result |
|---|---|
| `pnpm test` | **947 passed**, 24 files |
| `pnpm test:integration` | **246 passed**, 18 files |
| `pnpm test:e2e` | **39 passed, 18 skipped, 0 failed** |
| `pnpm build` with `.env` moved aside | exit 0 |
| `check-dynamic-routes` | OK — and **proven to fail** on a tampered manifest |
| `pnpm lint`, `pnpm typecheck`, `pnpm format` | clean |
| `prisma migrate diff --exit-code` | `No difference detected` |
| `core-flow` steps 1–2 | un-skipped, both pass |
| area derived | `areaM2: 999` in the payload is ignored; 5 m × 4 m → 20 |
| `showIf` agreement | wizard and server never disagree across five answer sets |
| terminal status | `SUBMITTED` unmoved and unmisreported; `CLOSED` not resurrected |
| ownership | another customer's project → `NOT_FOUND` |
| soft delete | deleted project absent from reads, present for `prismaUnfiltered` |
| point resolution | no pin → district centroid + `DISTRICT`; pin → `EXACT` |
| deactivated option | still renders and stays selected on the project that chose it; absent from a new one |
| authorisation matrix | 86 methods, project methods assert `customer-owned` + both identities |

#### Findings

**`getProduct` was admin-only while its comment said "as the configurator would load it".**
Written in Phase 2 before a configurator existed. A public wizard calling it would have got
`FORBIDDEN` and rendered a form with **zero questions** — failing silently. Fixed with a
separate `getConfigurableProduct` rather than a widened permission, because the visibility
rule differs too.

**And that visibility rule is three-sided, not two.** The first version returned active options
only, which breaks the customer it exists for: `10` §Admin authoring says a deactivated option
keeps rendering on projects that already reference it — a **customer** rule. Without it,
somebody who left a draft half-finished returns to find their answer gone, and if the attribute
is required, readiness reports a question they cannot see. It hits the customer who waited
longest. Now: active options **plus** the inactive ones this project already chose, passed as
ids by a caller that has already proved ownership.

**The status bugs were one bug.** `Project.status` was written from two sites with two guards
that had drifted: validating a `SUBMITTED` project reported `READY` while the database said
otherwise, and validating a `CLOSED` one resurrected it. One transition function in
`domain/status.ts` now, and `validate` returns the **persisted** status — reporting a computed
one while the database holds another is a lie Phase 6 would read out of that field.

**The route-cache check failed on itself first.** `app-path-routes-manifest.json` keys by
source path, which still carries the route group; the value is the URL served. Comparing keys
made it report every route missing. Wrong in the safe direction — a false failure is fixed in
minutes, a false OK guards nothing forever.

**A Phase 2 test was faking a table that Phase 4 then created — and dropping it.**
`catalog.integration.test.ts` proved "an option referenced by a project cannot be deleted" by
running `CREATE TABLE IF NOT EXISTS "ProjectAttributeValue"` with two columns, inserting a
row, and `DROP TABLE`-ing it in a `finally`. Reasonable in Phase 2, when the real table did
not exist.

Migration 6 created it. The create became a no-op against the real table, the insert violated
`projectId NOT NULL`, and the `finally` **dropped the real table** — out from under every
other file, because Phase 3's harness change made the database shared. The visible symptom was
six failures in unrelated *seed* tests, which is as far from the cause as it gets.

Two lessons worth keeping. A stub for a table that is coming is a landmine with a date on it.
And `DROP TABLE` in a test `finally` is never proportionate — the test now creates real rows
and deletes rows.

**The integration harness had a start-up race that aborted whole runs.**
`container.start()` resolving is not the same as Postgres accepting connections: the official
image runs a temporary server for `initdb` that logs *"ready to accept connections"*, stops it,
then starts the real one. `migrate deploy` intermittently met `P1001` and failed the **entire
run** rather than one test. `global-setup.ts` now polls a real connection before migrating —
better than retrying the migration, because a half-applied migration is worse than a slow
start.

**`core-flow` step 1 could not be written as `03` §F1 draws it.** Homepage → product detail
needs Phase 8 screens. It proves the half F1 depends on — a visitor with no account reaches a
configurable product — and says so rather than pretending.

#### Carried forward

- **Anonymous drafts are 4.5**, so `createProject` still refuses a caller with no identity;
  `04`'s CHECK constraint would reject the row. The ownership scoping already carries
  `anonymousKey`, so 4.5 adds a cookie and a claim flow, not a reshaping.
- **Attachments are 4.6.** `ProjectAttachment` ships in migration 6 and the step exists with
  only its note field.
- **The map picker is not built.** `10` makes it optional and the service accepts a pin; no
  screen offers one, so every project resolves to `DISTRICT`.
- **Q24** — the `(customer)` and `(manufacturer)` segments are not actually auth-gated.
- **Q22** — proximity scoring precision, owned by Phase 5.
- **`ServiceArea` still discards its `precision`**, so a radius comparison has one end that
  knows its accuracy and one that does not. Phase 5's migration is where the column is cheap.

### 2026-08-23 — Phase 4 tasks 4.5, 4.6, 4.8, 4.9 (commit `P4.5-4.9 · Faz 4 kapanışı`)

**The phase gate is NOT proven.** Read that first. Every task below is written, and none of
the five local commands, neither test suite and no e2e spec has been executed against this
work — the session that wrote it had no shell on the development machine and no package
registry in its own container, so `pnpm install` was impossible and with it typecheck, lint,
vitest and `next build`. The phase row therefore reads **🟡 9/9**: nine tasks landed, gate
undemonstrated. `26` §8 is explicit that a phase moves to ✅ only when its gate is
*demonstrated — commands run, output reported*, and asserting it here because the code looks
right is exactly the failure that rule exists to prevent. The first person with a working
checkout runs the list in §Verification below and moves the row.

Expect compile errors. This is the first half-phase in the project written without a single
green run behind it.

#### 4.5 · anonymous drafts and claiming

`ADR-023`: **the draft key is a ninth field on `ActorContext`**, resolved by `resolveActor`
from the cookie header alongside the session. The alternative — threading it through each
service's input, which `ownedBy(actor, anonymousKey?)` had been shaped for since the first
half — is the shape where a caller can forget, and forgetting produces a **silent
`NOT_FOUND`** rather than an error: the row is simply not matched, which reads exactly like
"no such project". Identity is resolved in one place for the same reason `12` gives.

The key is **carried through sign-in** rather than cleared, because claiming needs both
identities in one request. `ownedBy()` gives `userId` precedence, so ownership stays
unambiguous: `04`'s CHECK constraint keeps the row unambiguous and precedence keeps the query
unambiguous. Those are different questions and conflating them is what made the first draft of
this wrong.

**Claiming is one `updateMany`.** `04`'s `CHECK ((customerId IS NULL) <> (anonymousKey IS
NULL))` rejects the intermediate state where both columns are set, so a write-then-clear
implementation fails at the *first* statement — which presents as a broken constraint rather
than as an ordering mistake, and is why the integration test asserts the **row** rather than
the return value. Both columns are read back.

The cookie must still match: `where: { id, anonymousKey: key, customerId: null }`. That clause
is the whole authorisation, and without it any signed-in account could claim a draft by
guessing an id — the ids being the only thing between a stranger and somebody's dimensions,
address note and site photos. Tested from the attacker's side, not only the owner's.

Three drafts per key, counted in **rows** (`10` §Anonymous drafts). Counted rather than
tracked in the cookie, because the cookie is attacker-controlled; `04`'s XOR constraint is
what makes the count well-defined at all. `duplicateProject` checks the same ceiling, or
"duplicate" is an unauthenticated way past a limit the create path enforces.

Claiming is idempotent — a double submit reports `claimed: false` rather than telling a
customer their own project does not exist — and it writes the only `project_claimed` audit
entry there will ever be, because a successful claim **destroys its own evidence**: the key
that connected the draft to the visitor who made it is the column the claim nulls.

The cookie is not deleted afterwards. It may address two more drafts, and deleting it would
strand them: reachable by nobody, removed by nothing until Q25's sweep.

#### 4.6 · attachments

`PHOTO` and `DOCUMENT`, with the kind **derived from the MIME type** rather than asked for —
`14` §Limits decides MIME from content, and a client-declared kind would send a PDF through
the image pipeline.

The interesting part was `mayUploadFor`, which opened with `if (actor.userId === null) return
false`. Correct for Phase 3, where every uploader was a manufacturer, and it would have turned
"attach a photo to your draft" into a silent `FORBIDDEN` for precisely the visitor `ADR-021`
went to the trouble of letting configure. `PROJECT` is now checked **before** that line.

**The storage key never needed re-keying**, which was the trap this task was warned about.
`storageKey()` addresses an object by `ownerType/ownerId`, and `ownerId` for a project
attachment is the *project* id — so a draft changing hands moves no objects. Had it embedded
the customer, `claimProject` would have had to migrate storage inside a request a customer is
waiting on.

Access class is semi-private, per `14` §Access control. The customer half of *"the customer and
manufacturers whose request is `ACCEPTED`+"* is built; the manufacturer half is Phase 6's,
because `OfferRequest` does not exist — and the honest answer for a table that does not exist
is no, not a placeholder returning `true` that gets forgotten.

#### 4.8 · customer dashboard, and Q24

`ADR-024`: a `layout.tsx` per gated segment resolves the actor and redirects to `/giris`.
`07` §Rendering strategy had called `(customer)` auth-gated since Phase 0 with nothing gating
it. Nothing leaked in four phases because every page loaded its data through a service that
scopes by ownership — an unauthenticated visitor met an empty shell. **Task 4.8 is what
changed the arithmetic**: a page that lists a customer's projects is not harmless when it
renders for anyone.

Not the middleware: `12` §Authorization splits the jobs, and a matcher would have to trust an
unverified cookie or open a database connection on the edge. The layout is not the
authorisation either — services remain the only thing between a request and a row — and the
company half of `(manufacturer)` stays with them, because `02` §Enforcement rule wants one
place.

`/giris` and not `/yetkisiz`: an anonymous visitor has not been refused, they have not been
asked. Conflating the two tells a signed-out customer they lack a permission they hold.

`listProjects` is scoped by the same `ownedBy()` as everything else, so **an anonymous visitor
gets a list too** — the drafts their cookie holds. Not scope creep: refusing would have meant
a second ownership rule reading "except for lists".

#### 4.9 · duplicate

`10` §Reuse — everything except attachments and status. Both exclusions have reasons worth not
re-deriving. Attachments are excluded because a `ProjectAttachment` points at a `File` whose
key embeds the owning project, so copying the row would give two projects one object and make
the semi-private read rule answer for both at once. Status is excluded because readiness was
established against the old values and the customer is duplicating in order to change some —
which is the rule `statusAfterEdit` already states for the same reason.

The point is re-resolved rather than copied, so `pointPrecision` keeps describing how *this*
row's location was determined.

#### Documents moved

- `ADR-023` (the ninth `ActorContext` field), `ADR-024` (segment auth gates)
- `05` §ActorContext — nine fields, with the precedence rule
- `07` §Rendering strategy — names the mechanism instead of the intention
- `README.md`, `CLAUDE.md` — the document set is `00`–`28`, not `00`–`26`; the decision log
  runs to ADR-024, not ADR-021. Both had drifted since Phase 3.

#### Verification — the list somebody has to run

```
docker compose up -d && pnpm install && pnpm prisma migrate deploy && pnpm seed demo
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
pnpm test:integration
pnpm test:e2e
```

The gate itself is `e2e/phase4-gate.spec.ts`: an anonymous visitor configures, the browser
restarts, the draft survives, they register and sign in, the draft becomes theirs, and the
cookie alone can no longer reach it. The restart is modelled as a new browser context seeded
from `storageState()` — cookies restored, memory gone — because `page.reload()` proves only
that the *server* holds the state, which the first half already proved. What 4.5 adds is that
the **identity** survives, and a session cookie would fail that.

The last assertion is the one that is easy to fake: *"and from that moment `anonymousKey` is
null"* cannot be read from a browser, so what is asserted is its only consequence — a context
holding just the old draft cookie gets a 404 on a project it owned a moment ago.

#### Carried forward

- **Q25** — the retention sweep. The rule is written and unit-tested; nothing runs it. Phase 9.
- **Q21 was closed in the log on 2026-08-16 and never in the table**, where it sat live for a
  week. Struck through now. `CLAUDE.md` §Definition of done requires a deferral to reach the
  table; it does not require the closure to, and that asymmetry is what left it there.
- `mayReadPrivate` still answers no for a manufacturer reading a project photo. Phase 6.
- Q19 unchanged: `scan()` returns `CLEAN` unconditionally, so the attachment gate is built and
  the scanner is not chosen. The uploader shows a scan status, which stays useful the day a
  real scanner lands.

### 2026-08-23 — Phase 4 gate proven (commit `P4.5-4.9 · Faz 4 kapanışı`)

The verification list from the previous entry ran, on a working checkout with containers.
**Everything is green and the gate is demonstrated**: typecheck, lint, format, 977 unit
tests, `next build` with no `.env`, `check:routes`, 265 integration tests
(`project-claim` included), and the full Playwright suite — 43 passed, `phase4-gate.spec.ts`
among them: the anonymous draft survives a context restart, the claim moves it, and the
context holding only the old cookie gets its 404. `prisma migrate diff` reported no drift,
as predicted — no migration belonged to this half-phase.

The predicted compile errors **did not materialise**: `tsc --noEmit` was clean on the first
run, including `PROJECT_INCLUDE`, the `_count` select, the nested `duplicateProject` create
and the ninth `ActorContext` field. What actually broke, and was fixed:

- **One lint error, and it was real**: `proje/[id]/page.tsx` dynamically imported
  `modules/media/domain/upload-policy` from `app/` — the layer rule bans domain imports even
  dynamically. `UPLOAD_POLICY` is now re-exported through `media/application/file-service.ts`
  and the page reads it there; same table, one authority, right layer.
- **`authorisation-matrix.test.ts` timed out on a cold vitest cache** — importing the whole
  service graph now takes longer than the 5 s default *test* timeout, and two tests read the
  registry without importing at all (an ordering dependency that happened to hold). A
  `beforeAll` with its own 120 s budget imports once; no assertion changed.
- **`wizard.attachments.size`** (`{kilobytes} KB`) is identical in both locales for the same
  reason `estimate.range` is — punctuation around a localised number — and joined the named
  exception list in `messages.test.ts`.
- **Prettier**: the predicted 3.8.1 → 3.9.6 drift, three files, reformatted, no diff beyond
  whitespace.
- **`core-flow.spec.ts` step 2 raced its own save**: the derived "20 m²" is visible before
  the PATCH round-trips, so `page.reload()` could beat the write on a cold server and read
  an empty row. Both it and the same latent race in `phase4-gate.spec.ts` now wait for the
  wizard's own "Kaydedildi." status line before reloading/capturing state. The assertions
  are unchanged — the wait is sequencing, not loosening.
- **`account.spec.ts` asserted a behaviour 4.5 deliberately changed**: "a dead session
  clicking *configure* is refused" stopped being true the moment an anonymous visitor may
  configure. The dead-session assertion now uses the gate that exists for exactly this —
  `ADR-024`'s layout redirect on `/hesap` — which `phase4-gate.spec.ts` proves genuine.
- **The a11y suite was scanning the login page twice under two wrong names**: `ADR-024`'s
  gates redirect an anonymous visitor, so the `/hesap` and `/panel` scans now run with a
  seeded session — written directly to the `Session` table as a fixture, because two more UI
  logins is exactly what pushed the suite over the auth surface's 10-per-15-min IP budget.
  `/giris` joined the scan list under its own name, and its one real violation — the
  register link distinguishable only by colour inside a sentence — is fixed with a
  persistent underline on all three auth-footer links (WCAG 1.4.1, axe `link-in-text-block`).
- **A Playwright `globalSetup` truncates `RateLimitHit`** before each run: two local runs
  inside fifteen minutes stacked onto one rate window and the second failed on correct
  logins. In-run limits are untouched.
- One transient: three `audit-and-abuse` integration tests dropped their connection on the
  first cold 338 s run and passed alone and on the second full run. Environmental, watched,
  not chased.

No design decision moved. The single `UPDATE` claim, the `where`-clause ownership, the
carried key, and the matrix rule all survived contact with the compiler unchanged.

### 2026-08-23 — Phase 5 tasks 5.1–5.5 (commit `P5.1-5.5 · eşleştirme ve skorlama`)

The engine half of matching: eligibility, scoring, the pricing pass, ranking and
persistence. The surface (5.6–5.9) is deliberately not here.

**Q18 was answered with its table default, and that is a schema-shaping assumption.** The
question — does snow/wind load change dimension *limits* or only price — is still open in
the table, so this phase proceeded on "regional effect is price-only; dimension limits are
country-wide". `dimensionBounds()` remains the single read point and `BoundsContext`
already carries city/district, so if the real answer is "limits change", the change is a
schema addition (`ProductAttribute.max` per region) plus one function — but it is
*retroactive* about migration 7's shape, and it was not silently made: it is the first line
of the phase report.

#### 5.1 · eligibility — one SQL query

`eligibleCompaniesForProject` in `shared/geo` (the only file allowed PostGIS SQL,
`ADR-002`/`ADR-015`): verified + active product + covering area + required-options-offered +
not suspended, one statement, `GROUP BY` company. Blocklists are condition five's other
half in `09` and there is deliberately no clause pretending to check a table that does not
exist.

**Found while proving GiST usage with EXPLAIN**: `09` §Service-area coverage's own SQL —
`ST_DWithin(sa.center_point, :point, sa.radius_km * 1000)` — cannot use the GiST index as
written. The expansion distance is a column of the indexed table, and an index condition
must be constant with respect to the scanned relation; EXPLAIN shows the predicate demoted
to a row filter. The fix is a second, constant-ceiling `ST_DWithin(…, 500000)` first — 500
km is `addServiceAreaSchema`'s own cap — which plans as `centerPoint &&
_st_expand(point, 500000)`, an index condition, with the exact per-row test running behind
it. Applied to `companiesCovering` too, same reasoning, comment points here.

#### 5.2 · scoring

`matching/domain/scoring.ts`, pure like the pricing engine and for the same reasons. Seven
weighted components exactly per `09` §Scoring (25/20/20/15/10/5/5), weights read from one
`matching.weights` `PlatformSetting` JSON row with `version` inside it, stored on
`MatchRun.weightsVersion`. Bayesian rating `(C·m + Σ)/(C + n)`, `C = 5`, prior = platform
mean (a setting, default 4.2): with zero reviews everywhere (Phase 7), every company sits on
the prior — the designed cold start. Newcomer allowance: +5 bounded points for 30 days after
verification. **Price is not a component and `CandidateSignals` has no price field**, so
adding one is a visible act. Responsiveness and history read signals that do not exist
until Phase 6 (`OfferRequest`); they return the neutral middle and zero respectively, named
as such in the code rather than faked.

**Q22 closed by doing what its row prescribed**: proximity is scored in **bands**, not
continuously — ratio-of-radius bands when a RADIUS area matched, absolute km bands for
CITY/DISTRICT, neutral 0.5 for unknown distance — so centroid-grade error (`ADR-019`) moves
a score only when it crosses a band edge. And `ServiceArea.precision` arrived in migration
7: the geocode job now persists the precision it always computed, nulls meaning "geocoded
before the column existed".

#### 5.3 · the pricing pass never removes a match

Per candidate: the published book, the same pure engine, a `PriceCalculation` row per priced
result (`PRC-02`, actor + IP per `ADR-006`). No book, product not in book, company-level
`priceOnRequest`, engine throw — every shape lands in the results as `priceOnRequest`,
never dropped. The integration test bites: the bookless company is given the **highest raw
score on the board** and the test asserts it still sorts below every priced company.

#### 5.4 · deterministic ranking

`ORDER BY priceOnRequest ASC, score DESC, distanceKm ASC, companyId ASC`, null distances
last within their tier. One comparator (`compareForRank`), exported and unit-tested; the
integration suite runs the pipeline twice and asserts identical order, and builds two
candidates with deliberately identical signals to prove the tie breaks on `companyId`
rather than on iteration order.

#### 5.5 · persistence

Migration 7 (`20260823000000_phase5_matching`): `MatchRun(projectId, weightsVersion,
resultCount, durationMs)`, `MatchResult(rank, score, scoreBreakdown, priceCalculationId?,
priceOnRequest, distanceKm)` with `unique(matchRunId, companyId)`, plus
`ServiceArea.precision`. The run and its results are written in one transaction;
`getMatchRun` re-serves the stored run without recomputing (`09` §Pipeline), and the
customer view carries **band, rank and distance only** — no score, no breakdown, no line
items (`ADR-006`, `09` §Explainability); a test asserts the exact key set.

Service methods `matching.runMatch` / `matching.getMatchRun` are `customer-owned`, both
identities, ownership in the `where` clause — a stranger's project answers `NOT_FOUND`,
tested from the attacker's side with both a wrong user and a wrong cookie.

#### Carried forward

- Zero-result handling (widening, "may be able to help", the notify-me subscription) is the
  results *page's* behaviour — 5.6–5.9. An empty run is persisted with `resultCount: 0`.
- `Company.avgRating` / `reviewCount` / `medianResponseMinutes` denormalised aggregates
  (`09` §Performance) wait for the tables they aggregate (Phases 6–7); scoring reads
  today's signals batched per run instead.
- The customer blocklist named in `09` §1 condition 5 has no table anywhere in `04`. Phase 6
  should decide whether it exists in V1.

### 2026-08-24 — Phase 5 tasks 5.6–5.9 and four carried gaps (commit `P5.6-5.9 · Faz 5 kapanışı`)

**The four gaps first, because they were owed:**

- **The Phase 4 e2e count is on the record**: 43 passed / 18 skipped / 0 failed, re-run
  fresh before anything else moved. The ✅ rows stand on that number.
- **`radiusKm`'s 5–500 range is a CHECK constraint now** (`ServiceArea_radiusKm_range`,
  migration 7 — still unpushed when edited). It had lived only in Zod, which made
  `ADR-025`'s constant pre-filter correct by convention; a raw row with `radiusKm > 500`
  would have silently dropped out of every match. An integration test inserts 600 and 2 and
  asserts the database refuses both.
- **`09` §Service-area coverage now shows the two-call SQL** and says why the one-call
  version cannot use the GiST index; **`ADR-025`** records the decision, the alternatives
  and the reversal condition.
- **The remote exists and CI is green** — seven red runs (#1–#7), then run #8 green with all six
  stages (static 0.8m · unit 0.5m · integration 1.7m, the p95 assertion included · build
  1m · e2e+a11y 2.7m · lighthouse 0.4m). Every red found something real; the handover's §4
  lists them (missing `prisma generate` under pnpm 11's script blocking; two
  file-ordering test races the suites had carried since Phase 2/3; the storage tests'
  unstated MinIO dependency; `--wait` versus the one-shot init container; and the
  discovery that on a public repo only *annotations* are readable without access, which
  the integration job now uses for its failure tail). The repository is **public** at
  `github.com/candeniz/hemenpergola`, branch `master`, secrets scan over the full history
  clean before the first push.

#### 5.6 · results and comparison

`/hesap/projeler/[id]/eslesmeler` (+ skeleton `loading.tsx`) and
`/hesap/projeler/[id]/karsilastir`. First visit computes behind the loading state, revisits
read the stored run, "Yeniden hesapla" is the explicit re-run (`09` §Pipeline). **Every band
is `EstimateBand`** — the results card converts `MatchResultView` to `CustomerEstimate` and
renders the Phase 3 component; nothing on the customer path formats money itself, and the
Stitch screens' per-option prices predate `ADR-006` and were not copied. Comparison is
capped at 3 on **both** sides of the URL: the fourth checkbox is refused with a reason, and
the compare page drops extras server-side — a checkbox cap alone is a cap any edited URL
ignores (`CUS-06`). The wizard's summary now carries the real `GET OFFERS` button for a
signed-in customer; the account wall for the anonymous one is unchanged (`ADR-021`).

#### 5.7 · the zero-result ladder

Zero results render the ladder, not an error (`07` §System states): the radius test widened
by one step (+25 km, labelled, computed via `eligibleCompaniesForProject`'s `widenRadiusKm`
and **not** persisted as matches — a widened result is an offer of the page, though its
`PriceCalculation` rows are persisted like any estimate a customer sees, `ADR-006`); then
"may be able to help" — verified companies serving the location without the product, names
only, clearly separated; then the notify-me subscription, stored as a `Notification` row
(`type: supply_gap_watch`, payload carrying location + product so repeated zero-result
districts read as the supply-acquisition backlog). `Notification` is `04` §Messaging's own
model pulled forward into migration 7; `NotificationPreference` stays with Phase 7.

#### 5.8 · price-unavailable is a state, not a route

`MatchResult.priceState` (`PRICED` / `ON_REQUEST` / `UNAVAILABLE`) keeps `08` §Failure
modes' shapes apart where the customer reads them: an engine failure renders "cannot be
calculated right now" in the band's place, on the same card, in the same list — sending the
customer elsewhere would undo 5.3's rule in the UI, and telling them to "ask the
manufacturer" for a price we failed to compute would dress our failure as their choice.
`priceOnRequest` stays the ranking key.

#### 5.9 · the p95 budget, measured in CI

`match-performance.integration.test.ts`: 200 fully-priceable candidates (the doc's own
ceiling, every one taking the expensive path), two warm-ups, twelve timed runs, p95 asserted
≤ 2 500 ms. Runs in the integration stage, so CI makes the claim on every push. Local
measurement: **p95 805 ms** (min 401, max 805) on the development machine. Persistence was
rewritten to batched `createManyAndReturn` on the way — the per-row transaction loop was the
slowest part of the run.

#### Two Phase 4 defects, found by making step 3 walk the real wizard

Neither was visible to Phase 4's own gate, because the gate never chose a location and its
integration fixtures used synthetic products. Both surfaced the first time an e2e walked the
whole wizard against the real catalogue:

- **The public wizard's location step could never be filled.** `listCities` /
  `listDistricts` were gated behind `MEMBER_READ` (a Phase 3 assumption `ADR-021` quietly
  invalidated), the customer actor got `FORBIDDEN`, and the page's fallback rendered two
  empty selects. Both methods are `anonymous` now, with the history in their comments — 81
  provinces and 974 districts are public reference data.
- **No real catalogue product could ever reach `READY`.** The catalogue names its dimension
  attributes `genislik_mm` / `cikinti_mm` / `yukseklik_mm`; readiness looked bounds up by
  `widthMm`-style field names (finding nothing, so **no catalogue bound was ever enforced**,
  Q12's ranges included) and then demanded an option-shaped answer to those same required
  attributes, which the dimensions step had already answered. `DIMENSION_ATTRIBUTE_KEYS` in
  `steps.ts` is now the one translation table; readiness resolves bounds through it and
  treats dimension attributes as answered by the dimensions rules. The wizard also stops
  rendering optionless attributes as empty required-looking fieldsets.

#### Also

- `core-flow.spec.ts` steps 3 and 4 are live: sign in (via a session fixture —
  `session-fixture.ts` — because two more form logins pushed the suite past the auth
  surface's 10-per-15-min budget and broke an unrelated spec) → walk the whole wizard to
  `READY` → `GET OFFERS` → ranked cards with bands, then the zero-match branch (a Trabzon
  project meets the ladder and the watch button), then compare — three columns, the fourth
  refused, URL-edited extras dropped.
- The demo seed grew a supply side: Ege Pergola and Anadolu Güneş now carry offers, an
  İstanbul service area and a **published price book** each, so `GET OFFERS` prices for
  real. Marmara Cam deliberately stays bookless (the pilot), which keeps one honest
  `priceOnRequest` row in every demo result list (`PRC-06`).

#### Carried forward

- The widened-search results are labelled but not persisted; if Phase 6 wants "request an
  offer" from a widened result, the request flow must run the match properly first.
- `Notification` rows are written and nothing sends them — Phase 7 owns delivery.
- The compare screen shows band + distance only; portfolio and rating columns arrive with
  the data that fills them (Phases 6–7).

### 2026-08-24 — Phase 6 tasks 6.1–6.5 + 6.10, and five carried gaps (commit `P6.1-6.5+6.10 · talep yaşam döngüsü ve ifşa`)

**Entry condition.** Q7 proceeded on its sanctioned default (48 h in `PlatformSetting`).
**Q6 proceeded on the 20% default too — flagged, not decided**: the decision calendar says
"confirm with an accountant", that confirmation has not happened, and the rate rides real
money on real offers. The setting exists (`tax.kdv_default_percent`), the human step is
open.

**The five gaps:**

- CI run **#9** (`ffa544b`, docs-only) completed **success**; the earlier log entry
  mis-numbered the first green run as #6 — it was **#8**, and the reds were #1–#7. Both
  documents corrected.
- The "no deploy stage" test's inline `replaceAll` became `DEPLOY_WORD_EXEMPTIONS` — a
  named list plus a test asserting it contains exactly `prisma migrate deploy`, the same
  shape as `OPERATIONAL_PROBES` and for the same reason.
- `matching`'s anonymous surface is pinned: named, counted, and shape-checked
  (`get*`/`list*` only). The pin's first catch was real — `companiesCoveringPoint` had been
  anonymous since Phase 3 (public directory data; it fed the phase gate's boundary probe)
  and is now `listCompaniesCoveringPoint`, so the read-shape rule holds with no exception.
- `catalogue-data.test.ts` now proves every seed `NUMBER` attribute resolves through
  `DIMENSION_ATTRIBUTE_KEYS` — the tripwire for the alias table's `CAT-03` gap, recorded as
  **Q27** in the table (semantic-role column, Phase 8).
- `phase4-gate.spec.ts` walks the whole wizard through the shared `wizard-walk.ts` and
  asserts **`READY` twice** — before the restart (reached) and after it (survived) — which
  is the half of `21`'s gate sentence the old spec never carried, and exactly the hole the
  un-READY-able-catalogue bug walked through. `core-flow` 3–4 sign in through the **real
  form** again, budgeted the way `account.spec.ts` does (one `x-forwarded-for` per test);
  the session fixture remains only in `a11y.spec.ts`, whose subject is the shells.

#### 6.1 · the machine

`offer/domain/state-machine.ts`: `11` §Transition table row for row, pure, table-driven,
with the actor column enforced and every guard in the table. The unit suite sweeps all
13 × 14 × 4 (state, event, actor) combinations: everything off the table is `CONFLICT`,
terminal states have no outgoing edge, and `(from, event)` is unique so order cannot change
an answer.

#### 6.2 · the service shape

`FOR UPDATE` load (company in the WHERE — ownership stays in the query) → `transition` →
in-transaction side effects → **notifications after commit**. The proof is behavioural: the
loser of 6.10's race returns before the post-commit step and writes no notification row.

#### 6.3 · consent

`ConsentCheckbox` (never pre-checked; the body says revocation cannot recall what was
shared) hands back `CONTACT_SHARING_TEXT_VERSION` from `shared/legal/consent-version.ts`;
`createOfferRequests` records the `Consent` row in the same transaction as the requests and
**refuses a stale text version** — a tab left open across a text change re-asks instead of
recording consent to unseen words. The per-project cap counts live requests only
(DECLINED/EXPIRED/CANCELLED free their slots, per `11` §SLA).

#### 6.4 · the disclosure

`PENDING → ACCEPTED`, exactly once: `ContactDisclosure` (exact fields) + **two audit rows
written inside the transaction as plain inserts** — `19` calls them mandatory, so the
best-effort `recordAudit` is deliberately not used and an audit failure rolls the
acceptance back — + the customer notification after commit. Belt and braces:
`ContactDisclosure.offerRequestId` is UNIQUE in migration 8, so a second row is impossible
even if every lock failed. A second accept is a 409 that writes nothing.

#### 6.5 · the DTO boundary

`lead-dto.ts`, the `estimate-dto` construction: `NoContactFields<T>` makes any
contact-shaped key `never` at compile time, `PendingLeadView` cannot carry one, and the
pending read **never SELECTs the customer relation at all**. The tests are on the DTO's
shape — type-level in `lead-dto.test.ts`, serialised-JSON in the integration suite — not on
a rendered page, which would stay green over leaking JSON.

#### 6.10 · the race

`Promise.all([accept, decline])` on one PENDING row: exactly one succeeds, the loser gets
`CONFLICT`, the row holds the winner's status, and when decline wins the disclosure count
is zero and no notification exists — the row lock and the machine doing exactly what `11`
§Implementation promises.

#### Carried forward

- **The production disclosure path is blocked on Q2 and open.** Contact disclosure wants a
  verified phone; real phone verification wants the alphanumeric SMS sender, which wants
  İYS registration, which wants the legal entity — the chain `28` §9 already names. All
  code runs against the log adapters.
- The SLA expiry job (`offer_request.sla_expire`) has a queue name and a machine edge and
  no worker handler — 6.6–6.9, with the reminders at 50%/90%.
- `slaExpiresAt` is plain hours, not yet business-hours-aware for `Europe/Istanbul` (`11`
  §SLA) — second half, alongside the job that enforces it.
- Appointment/Offer/OfferLine tables shipped in migration 8; their services and the
  remaining machine edges' callers are 6.6–6.9. `Project.status → SUBMITTED` on request
  creation is deliberately untouched until the surface lands.

## Open questions — need a human answer before the phase that hits them

| # | Question | Blocks | Default if unanswered |
|---|---|---|---|
| Q1 | Brand name. The screens use *Outdoor Systems*, *Archivault*, *ARCHITECTURA*, *Arte Outdoor*, *ArchPortal*. | Phase 0 (i18n keys, logo, titles) — and **upstream of Q2/Q3**: the SMS sender ID is the brand | placeholder `{brand}` token everywhere, swapped once |
| Q2 | Legal entity, İYS registration, VERBİS status, and who reviews the KVKK texts | **Phase 0–1** (not Phase 9): İYS registration needs the entity, and Q3 needs İYS | development continues on the log-only adapter; the production disclosure path stays blocked |
| Q3 | SMS provider and sender ID (allocated only to İYS-registered businesses; provider approval itself commonly 1–3 business days) | **no longer blocks Phase 1** — task 1.5 closed on the log adapter, which is what the row asked for. Must clear by Phase 6 (disclosure) | log-only `SmsSender` adapter; the port and the whole OTP flow are built and tested against it, so the real adapter is one file |
| ~~Q4~~ | ~~Geocoding provider and budget~~ **NARROWED 2026-08-16 by `ADR-019`.** V1 needs no provider: the `Geocoder` port ships with an administrative-centroid adapter over the 974 district centroids Phase 0 seeded, plus optional coordinates a manufacturer can type. `09` §Service-area coverage already accepts a district centroid on the *project* side, so paying to place the other end to within ten metres buys nothing measurable. What remains open is narrower and belongs to Phase 8: **does the public directory need map tiles, and does a pin-drop picker come free with them?** | Phase 8 | administrative centroids; radius precision is stored and shown so a centroid is distinguishable from a pin |
| Q11 | **Profil rengi: hangisi standart, hangisi ek ücretli?** Katalog dört RAL sunuyor (9016 beyaz, 7016 antrasit, 9005 siyah, özel RAL) ve yalnızca *özel RAL*'in ücretli olduğunu varsayıyor. Stoklu renkler firmadan firmaya değişiyorsa bu varsayım her üretici için yanlış olur. | Faz 3 (fiyat listesi giriş ekranı bu varsayımı kullanacak) | dördü de seçilebilir, ücret farkı üreticinin fiyat listesine bırakılmış |
| Q12 | **Bioklimatik pergolada tek modül ölçü sınırları.** Katalogda genişlik 2000–6000 mm, çıkıntı 2000–4500 mm, yükseklik 2200–3500 mm. Bunlar taşıma kapasitesi ve lamel boyu üzerinden makul tahminlerdir, ölçülmüş değerler değil. Gerçek sınır kar/rüzgâr yüküne ve lamel profiline göre değişiyorsa hangi aralık doğru? | Faz 4 (sihirbaz bu aralıkların dışını reddedecek) | mevcut aralıklar; üstünü üretici modül birleştirerek çözer |
| Q13 | **Giyotin camda açıklık sınırları ve panel mantığı.** Katalog genişliği 1000–6000 mm, yüksekliği 1000–3000 mm alıyor ve panel sayısını **sormuyor** — üreticinin hesapladığını varsayıyor (`ADR-008` sınamasının sonucu). Panel sayısı müşterinin bilmesi gereken bir şeyse veya fiyatı doğrudan etkiliyorsa bu yanlış. | Faz 4 ve Faz 5 | açıklığı müşteri verir, paneli üretici belirler |
| Q14 | **Motor markası katalogda yer almalı mı?** Şu an `farketmez / Somfy / Nice`. Marka seçimi müşteriye sunulunca, o markayla çalışmayan üretici teklif veremez hâle gelebilir; alternatif, markayı gizleyip `standart / sessiz / akıllı-ev uyumlu` gibi bir sınıf sormak. Hangisi piyasada karşılık buluyor? | Faz 4 | marka listesi, varsayılan "farketmez" |
| Q15 | **Zip perde kumaşı: şeffaf PVC / mesh / akrilik ayrımı müşterinin anlayacağı ayrım mı?** Yardım metni "PVC manzarayı korur ama nefes almaz, mesh güneşi keser ve hava geçirir" diyor. Satışta bu üçlü mü konuşuluyor, yoksa marka/gramaj mı (ör. belirli bir kumaş serisi)? | Faz 4 | üçlü ayrım |
| Q16 | **Hangi opsiyonlar standart pakete dahil?** Katalog `sensor_paketi`, `aydinlatma`, `sineklik` ve `su_tahliye`yi ayrı ayrı sorulabilir sayıyor. Bunların bir kısmı sektörde standart olarak veriliyorsa, müşteriye ücretli opsiyon gibi göstermek fiyat tahminini şişirir. | Faz 5 (fiyat bandı) | hepsi opsiyonel, fiyatı üreticinin listesi belirler |
| Q17 | **`LENGTH_M` ve `UNIT` ölçü temellerinin karşılığı var mı?** Katalogdaki yedi ürünün hepsi m² ile fiyatlanıyor. Metrekare dışında satılan bir ürün (metretül korkuluk, adet bazlı motor/aksesuar) platformun kapsamına giriyorsa şimdi söylenmeli; girmiyorsa `Product.basisType` üç yerine tek değere inebilir. | Faz 5, ve `04` §Catalogue'un sadeleşmesi | üç değer şemada kalır, ikisi kullanılmaz |
| Q18 | **Kar ve rüzgâr yükü hangi alanı etkiliyor?** `08` §Algorithm'de bölgesel ayarlama var (`PriceBookRegionAdjustment`), ama kar yükünün ölçü sınırlarını mı, profil seçimini mi, yoksa yalnızca fiyatı mı değiştirdiği katalogda modellenmedi. Ölçü sınırını değiştiriyorsa bu `ProductAttribute.max`'ın bölgeye göre değişmesi demektir ve şema bunu desteklemiyor. | **Faz 4'ten önce** — cevabı "ölçü sınırını değiştirir" ise şema değişikliği gerekir. **Faz 5 (2026-08-23) varsayılanla ilerledi**: migration 7 bölgesel ölçü sınırı modellemedi; cevap "sınırı değiştirir" çıkarsa `ProductAttribute.max`'ın bölgeselleşmesi ayrı bir migration olur ve `dimensionBounds()` tek okuma noktası olarak durur | bölgesel etki yalnızca fiyatta; ölçü sınırları ülke geneli |
| Q19 | **Virüs tarayıcı ve SVG temizleyici.** `14` §Virus scanning dosyaların `CLEAN` olana kadar sunulmamasını istiyor; bu kapı kurulu ve zorlanıyor, ama `CLEAN` kararını verecek şey yok — `scan()` koşulsuz `CLEAN` dönüyor. Seçenekler: ClamAV yan konteyneri (altyapı maliyeti, worker imajına eklenir) ya da bir sağlayıcı API'si (dosya başına ücret, dosyanın dışarı çıkması). Aynı karar SVG'yi de kapsıyor: `14` sunucu tarafında temizlenmiş SVG'ye izin veriyor, temizleyici yok, bu yüzden logo yüklemede SVG şimdilik reddediliyor. | **Faz 9'dan önce** — üretici belgeleri ve müşteri fotoğrafları taranmadan yayına çıkmamalı | tarayıcı yok, kapı kurulu; SVG reddediliyor |
| Q20 | **Worker imajı nasıl paketlenecek?** `23` §Runtime `node dist/worker.js` diyor — aynı imaj, farklı entrypoint. Ne Dockerfile var ne de worker için bir derleme adımı; `pnpm worker` geliştirmede `tsx` ile koşuyor. Next'in kendi çıktısı worker'ı kapsamıyor ve `@/` yol takma adlarını çözecek bir bundler (esbuild/tsup) ya da `tsc` + `tsc-alias` gerekiyor. | Faz 9 (dağıtım), ama seçim worker'ın hangi bağımlılıkları imaja taşıdığını belirlediği için erken bilinmesi ucuz | `pnpm worker` (tsx) — yalnızca geliştirme |
| Q5 | Launch cities — matching quality depends on supply density per district | Phase 9 | Istanbul, Ankara, İzmir, Bursa, Antalya |
| Q6 | Default KDV rate confirmation (20%) and whether any product differs | Phase 6 | 20% platform-wide, admin-editable |
| Q7 | SLA window — 48 h is a guess about manufacturer behaviour | Phase 6 | 48 h, `PlatformSetting`, tune after real data |
| Q9 | **District-name spelling spot check.** 442 of 974 district names are pure ASCII. Most genuinely are (Ceyhan, Alanya, Kozan), but the build cannot tell those apart from a diacritic GeoNames never recorded. Needs a native Turkish reader to scan the list once. | Phase 3 (service areas) and Phase 8 (public URLs) — a misspelt district is visible to customers | ship as-is; the names come from GeoNames and are correct for 698 of them by construction |
| Q10 | **CAPTCHA provider, and its KVKK assessment.** `12` §Abuse controls calls for a CAPTCHA after 10 failed logins from one IP, but names no provider. reCAPTCHA and hCaptcha both send visitor data to a third party, which under `19` is a processor relationship needing a named purpose in the privacy notice and an agreement behind it — a decision, not an implementation detail. Turnstile is the usual answer for a lighter data footprint; that still needs the same assessment. | **Nothing, now.** Phase 1 shipped without it, deliberately: the port, the call site and the failure counter are all built, and `enforcing: false` means login proceeds past ten failures rather than locking the account out. Revisit before launch. | no challenge. `noopCaptchaProvider` reports `enforcing: false`, so login proceeds past 10 failures rather than locking the account out — a missing decision must not become an outage |
| ~~Q21~~ | ~~`src/app/[locale]/(manufacturer)/panel/[companyId]/hizmet-bolgeleri/page.tsx` calls `prisma.city.findMany` directly, which `CLAUDE.md` non-negotiable 2 forbids. The lint rule only inspects static imports, so a dynamic `import('@/shared/db')` inside `src/app` passes. Should the rule be extended to dynamic imports, and that page switched to `matching.listCities`?~~ **CLOSED 2026-08-16 — and the closure never reached this table, which is the point.** The rule was extended to `ImportExpression`, four violations were found and fixed, and two-way fixtures prove both directions; the dated log entry says so. The row stayed live here for a week because closing a question is a second edit nobody is prompted to make. `CLAUDE.md` §Definition of done requires the deferral to be in the table; it should require the closure to be too. | — | — |
| ~~Q22~~ | ~~Is district-centroid precision good enough for the **proximity score**?~~ **CLOSED 2026-08-23 by doing exactly what this row's default prescribed.** Proximity is scored in bands (`matching/domain/scoring.ts` — ratio-of-radius bands on a RADIUS match, absolute km bands otherwise, neutral for unknown), so centroid-grade error moves a score only when it crosses a band edge, and the unit suite asserts two centroid-grade-apart distances land in one band. `ServiceArea.precision` arrived in migration 7 and the geocode job now persists what it always computed; null means "geocoded before the column existed". Closed in the table in the same phase, per the Q21 lesson. | — | — |
| ~~Q23~~ | ~~Web sign-in establishes no session.~~ **CLOSED 2026-08-17 by `ADR-022`.** Entered retroactively, and the reason it is here at all is the point: Phase 1 *deliberately* deferred wiring a web session — "Auth.js wiring deferred; no screen required it" — and wrote that in the dated log rather than in this table. The log is over 130 KB; the table is what gets scanned. Three phases later Phase 4 found the login form validating credentials, rendering a tick and discarding the tokens, with `identify.ts` reading a cookie nothing ever wrote. `CLAUDE.md` §Definition of done now requires the table entry for any deferral. | — | — |
| ~~Q24~~ | ~~**The `(customer)` and `(manufacturer)` segments are not actually auth-gated.** `07` §Rendering strategy calls them "auth-gated" and "auth + company-scoped"; `middleware.ts` deliberately does locale only — correctly, since authorisation needs the database — and there is no layout guard, so `/hesap` renders for anyone. Nothing leaks today because every page loads its data through a service that scopes by ownership or permission, so an unauthenticated visitor sees an empty shell. Found while asserting session revocation in Phase 4: the natural check, "a protected page redirects", proves nothing. Where does the gate belong?~~ **CLOSED 2026-08-23 by `ADR-024`.** A `layout.tsx` per gated segment resolves the actor and redirects to `/giris`; `07` §Rendering strategy now names the mechanism instead of the intention. The company half stays in the services, where `02` §Enforcement rule wants it. Task 4.8 is what forced the answer: a dashboard that lists a customer's projects is not harmless when it renders for anyone. | — | — |
| Q27 | **`DIMENSION_ATTRIBUTE_KEYS` is a fixed alias table, and that breaks `CAT-03`'s promise at the margin.** Readiness resolves the catalogue's dimension attributes (`genislik_mm` family) to project fields through a hard-coded list in `modules/project/domain/steps.ts`. An admin who authors a new product with a differently-spelt dimension key (`en_mm`, `boy_mm`) gets a product that can never reach `READY`, and the fix is a code change — while `10` §What V1 builds says catalogue changes are data changes. The right shape is a semantic-role column on `ProductAttribute` (`dimensionRole: WIDTH\|DEPTH\|HEIGHT?`) the admin sets when authoring, with readiness resolving through it. | Phase 8 (admin catalogue authoring gets revisited there) | The alias table, plus `catalogue-data.test.ts`'s tripwire: every seed `NUMBER` attribute must resolve through the table, so a drift between seed and code fails the build instead of shipping an un-READY product. Admin-authored products are not covered by the tripwire — that is exactly the gap. |
| Q25 | **The anonymous-draft retention sweep has no scheduler.** `19` §Retention gives unclaimed drafts thirty days and says retention is *"enforced by the `audit.retention_sweep` job, not by manual cleanup"*. Task 4.5 wrote the **rule** — `expiredAnonymousDraftsWhere()` in `shared/context/anonymous-key.ts`, measured from `updatedAt`, restricted to rows that are still anonymous and not soft-deleted — and deliberately did not write half a sweeper: one table, no schedule, no audit entry, to be reconciled with Phase 9's own retention set later. Nothing deletes an expired draft today. | **Faz 9** (retention set). Not a leak — the rows are unreachable once the cookie expires — but it is *storage that grows and personal data that outlives its stated retention*, which `19` treats as a KVKK obligation rather than a housekeeping preference. | The rule exists and is unit-tested; Phase 9 adds the schedule and the audit entry. Recorded here rather than only in the log, per `CLAUDE.md` §Definition of done. |
| ~~Q8~~ | ~~Development machine cannot run containers.~~ **CLOSED 2026-08-16.** Virtualization was enabled in firmware and the machine restarted; `systeminfo` now reports a running hypervisor and `docker info` returns server 29.7.2. The full eight-item verification ran green — see the log entry for that date. | — | — |

## Known deviations from the brief

| Brief | This build | Where |
|---|---|---|
| §7 single estimate vs §32 min/max/median | per-manufacturer band for customers; aggregate is admin-only | ADR-006 |
| §27 configurator rules engine | attribute-driven form, engine deferred | ADR-008 |
| §17 KDV on offers, silent on estimates | estimates explicitly net, labelled | ADR-007 |
| KVKK not mentioned | consent, disclosure, retention, erasure built in | ADR-011 |
| §37 payments deferred | tables modelled, `501` on reserved paths | ADR-010 |
| 10-step wizard screens | 3 stages × 10 logical steps | ADR-013 |

## How to update this file

Append a dated entry with: what changed, which docs or ADRs moved, anything discovered that
contradicts a doc, and any new open question. Move the phase row when its gate is met — not
when the code is written.
