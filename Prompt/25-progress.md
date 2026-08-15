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
