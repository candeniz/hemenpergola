# 25 — Progress

The only file updated after **every** task. Append to the log, update the phase table, keep
open questions honest. If this file is stale, the next session starts by re-deriving what
someone already knew.

## Status

**Current phase:** documentation complete, execution plan written (`26-execution-plan.md`)
→ Phase 0 (Foundation) not started.
**No application code exists yet.** The repository currently holds this documentation set and
the design reference in `Frontend Tasarım/`.

## Phase tracker

| Phase | Scope | Status | Gate |
|---|---|---|---|
| Docs | 00–25, README, CLAUDE.md | ✅ done | — |
| 0 | Foundation | ⬜ not started | pipeline green, shells render in tr/en |
| 1 | Identity | ⬜ | authorisation matrix covers every service method |
| 2 | Catalogue + admin skeleton | ⬜ | admin adds a product with no deploy |
| 3 | Manufacturer supply side | ⬜ | a company is matchable |
| 4 | Project configurator | ⬜ | a project reaches `READY` and survives a restart |
| 5 | Matching + pricing | ⬜ | `GET OFFERS` returns ranked priced results |
| 6 | Offer request lifecycle | ⬜ | `e2e/core-flow.spec.ts` green |
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

## Open questions — need a human answer before the phase that hits them

| # | Question | Blocks | Default if unanswered |
|---|---|---|---|
| Q1 | Brand name. The screens use *Outdoor Systems*, *Archivault*, *ARCHITECTURA*, *Arte Outdoor*, *ArchPortal*. | Phase 0 (i18n keys, logo, titles) — and **upstream of Q2/Q3**: the SMS sender ID is the brand | placeholder `{brand}` token everywhere, swapped once |
| Q2 | Legal entity, İYS registration, VERBİS status, and who reviews the KVKK texts | **Phase 0–1** (not Phase 9): İYS registration needs the entity, and Q3 needs İYS | development continues on the log-only adapter; the production disclosure path stays blocked |
| Q3 | SMS provider and sender ID (allocated only to İYS-registered businesses; provider approval itself commonly 1–3 business days) | apply in Phase 1, must clear by Phase 6 (disclosure) | log-only `SmsSender` adapter in dev |
| Q4 | Geocoding provider and budget | Phase 3 (radius service areas) | district centroids only, no free-point radius |
| Q5 | Launch cities — matching quality depends on supply density per district | Phase 9 | Istanbul, Ankara, İzmir, Bursa, Antalya |
| Q6 | Default KDV rate confirmation (20%) and whether any product differs | Phase 6 | 20% platform-wide, admin-editable |
| Q7 | SLA window — 48 h is a guess about manufacturer behaviour | Phase 6 | 48 h, `PlatformSetting`, tune after real data |
| Q8 | **Development machine still cannot run containers — NOT yet resolved.** Docker Desktop is installed (CLI 29.7.2) but no daemon is reachable. `systeminfo` still reports `Virtualization Enabled In Firmware: No`, `Win32_Processor.VirtualizationFirmwareEnabled` is still `False`, and `LastBootUpTime` is 2026-08-15 15:10 — **the machine has not restarted since before the firmware change was reported**. Fast Startup (`HiberbootEnabled = 1`) is on, so a *Shut down* + power on does not re-read firmware settings; only **Restart** does. | **Phase 0 tasks 0.3, 0.5, 0.17, and the database half of 0.4 and 0.15.** Everything that does not need a live database is done and verified. | none. **Restart** (not shut down), confirm `systeminfo` reports `Virtualization Enabled In Firmware: Yes`, start Docker Desktop once, then run the verification list in the log entry below |

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
