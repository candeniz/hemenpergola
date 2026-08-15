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
| Q8 | **Development machine cannot run containers.** Virtualization is disabled in BIOS/UEFI (`systeminfo`: `Virtualization Enabled In Firmware: No`), so Docker Desktop cannot start and the local Postgres/MinIO stack has never been up. Not a question of design — it needs someone at the machine. | **Phase 0 task 0.3 evidence, and all of 0.4 onward**: Prisma, migrations, seeds and every integration test need a database | none. Enable VT-x/AMD SVM in firmware and reboot, or move development to a machine that already has Docker |

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
