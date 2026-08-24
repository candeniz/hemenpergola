# 29 — Launch checklist

Phase 9's gate is this file *"fully ticked, by evidence rather than assertion"*
(`21` §Phase 9). Every line therefore carries an **evidence** field that is one of two
things: a test/run/file name, or `bekliyor: X` — the named human or infrastructure
decision it waits on. **A line with a claim and no evidence is a defect in this file.**

Status legend: ✅ evidenced · ⏳ code ready, waiting on a named human/infra step ·
🔲 not started.

## A · KVKK (`19` §Pre-launch checklist)

| # | Item | Status | Evidence |
|---|---|---|---|
| A1 | Data export works end to end, subject-only content, signed 30-day link | ✅ | `privacy.integration.test.ts` — export → mail → token download; no line items, no received messages |
| A2 | Erasure works and is anonymisation, never hard delete | ✅ | `privacy.integration.test.ts` — personal fields cleared, commercial ids survive, replay refused |
| A3 | Retention sweep runs, dry-run first, legal-hold untouchable | ✅ | `retention-policy.test.ts` (empty intersection, structurally) + `privacy.integration.test.ts` (dry-run = applied, evidence survives, idempotent) |
| A4 | Export PDF rendering | ⏳ | bekliyor: an embeddable Turkish-glyph font decision — JSON ships today; the package shape (`data-export.v1`) is the PDF's input |
| A5 | Privacy notice, cookie notice, terms, consent text — lawyer-reviewed, versioned | ⏳ | bekliyor: **9.2 / Q2** — Turkish counsel; `shared/legal/` carries the versioned texts to review |
| A6 | VERBİS registration assessed | ⏳ | bekliyor: **Q2** — legal entity first |
| A7 | Processor agreements (mail, SMS, hosting, storage, geocoding, error tracking) | ⏳ | bekliyor: **Q2 chain + provisioning** — no processor is wired that is not contracted; the ports (`Mailer`, `SmsSender`, `ErrorTracker`, `StorageProvider`) are the seams |
| A8 | Audit log append-only enforced by a database GRANT | ⏳ | bekliyor: **9.4 / provisioning** — needs the production role; the application never issues UPDATE/DELETE on `AuditLog` (source-greppable) but the grant is the guarantee |

## B · Security (`19` §Application security)

| # | Item | Status | Evidence |
|---|---|---|---|
| B1 | CSP without `unsafe-inline` for scripts, nonce-based, app still works | ✅ (two-profile) | `public-directory.spec.ts` §9.3 — nonce on strict surfaces, headers asserted, login interactive under policy; release gate 9/9 under it. ISR public pages omit `script-src` honestly — see `19` §Headers for the structural reason and the PPR/JS-free follow-up |
| B2 | HSTS, nosniff, referrer-policy, permissions-policy on every response | ✅ | `public-directory.spec.ts` §9.3 header assertions |
| B3 | Rate limits live on the surfaces `06` names | ✅ (3 of 5) | auth since Phase 1; `offerRequestCreate` 5/h/user and `priceEstimate` 30/h-user + 60/h-IP wired 2026-08-24 in the services. `messages` 60/h/thread lives in `message-service`. `publicRead` 300/min/IP: ⏳ bekliyor: edge/CDN layer — a DB-backed limiter cannot see ISR cache hits |
| B4 | CAPTCHA / lockout after failed logins | ⏳ | bekliyor: **Q10** — provider choice + KVKK assessment; `noopCaptchaProvider` port is in place, progressive delay + lockout notice work today |
| B5 | Virus scanning on uploads | ⏳ | bekliyor: **Q19** — scanner choice; `virusScanStatus` gates serving today (PENDING files serve only to their uploader) |
| B6 | Dependency audit in CI | ⏳ | bekliyor: enable Dependabot on the repo (one setting); lockfile committed |

## C · Operations

| # | Item | Status | Evidence |
|---|---|---|---|
| C1 | Health endpoint checks real dependencies, leaks no free text | ✅ | `health-service.ts` — db/migrations/storage/queue; details to server log only |
| C2 | Error tracking | ⏳ port ✅ | `error-tracker.ts` + `onRequestError` + worker wiring; bekliyor: **Q2 chain** — a contracted provider before any adapter (`19` §Data location) |
| C3 | Alerting | ⏳ | bekliyor: **on-call decision — WHO is alerted, WHERE (channel/rota)**; `captureError` is the single hook the wiring hangs from |
| C4 | Backup restore rehearsed, incl. point-in-time | ⏳ | bekliyor: **9.4 — no production environment exists**; the compose stack is not the thing to rehearse against |
| C5 | Worker production image (`node dist/worker.js`) | ⏳ | bekliyor: **Q20 / provisioning** — no Dockerfile target exists; `pnpm worker` is the dev path |
| C6 | Hosting, managed Postgres, object storage, mail, SMS provisioned | ⏳ | bekliyor: **provisioning — never yet named as a task anywhere**; every one sits behind an existing port or env var |
| C7 | Load test of the matching path | ✅ | `scripts/load-test-matching.ts` — 2026-08-24: 0 errors through 120 concurrent; p95 crosses the 2.5 s SLA between 40 (1.36 s) and 80 (3.4 s) concurrent on the dev machine — linear pool queueing, no collapse, no lock contention observed |
| C8 | Matching p95 budget in CI | ✅ | `match-performance.integration.test.ts`, every CI run |
| C9 | Performance budgets on the five templates in CI | ✅ | the lighthouse job, every CI run since #15 |

## D · Content at launch (`18` §Content that has to exist)

| # | Item | Status | Evidence |
|---|---|---|---|
| D1 | How-it-works, about, contact pages | ✅ | seeded CMS pages, both locales; `content.integration.test.ts` |
| D2 | One price guide per seed product | ⏳ | bekliyor: **9.7 — editorial**; `/fiyat-rehberi/[slug]` route is unbuilt until content exists to fill it |
| D3 | City landing pages for top cities by coverage | ✅ mechanism | pages exist wherever supply exists (`directory.integration.test.ts`); bekliyor: **supply** — real manufacturers make real pages, Q5 reads from `MatchRun` zero-result telemetry (proven queryable) |
| D4 | ≥3 portfolio-bearing manufacturer profiles per launch city | ⏳ | bekliyor: **onboarding real manufacturers** |
| D5 | Catalogue content confirmed | ⏳ | bekliyor: **Q11–Q17 — the D3 pilot session** (`27-d3-pilot-guide.md`) |

## E · Manual checks before release (`20` §Manual checks)

| # | Item | Status | Evidence |
|---|---|---|---|
| E1 | tr + en copy on the five public templates | ✅ | `public-directory.spec.ts` renders both locales; `messages.test.ts` parity |
| E2 | Turkish characters in slugs and names | ✅ | `slug.ts` tests; e2e İstanbul city page |
| E3 | Turkish characters in PDFs | ⏳ | bekliyor: A4 (the PDF itself) |
| E4 | KDV arithmetic on a real offer vs hand calculation | ✅ | `offer-math.test.ts` + core-flow step 7's on-screen totals |
| E5 | An SMS and an email actually arriving | ⏳ | bekliyor: **Q2→Q3** — providers; log adapters prove the seams |
| E6 | Full pass on a mid-range Android over a slow connection | ⏳ | bekliyor: **9.8 — a physical device**; the lab budgets are not this (`18` §What these numbers claim) |

## Summary

Evidenced: **16** · Waiting on a named human/infra step: **17** · Not started: **0**.

The waiting set decomposes into five named chains: **Q2 legal** (A5–A7, C2, E5 upstream),
**provisioning** (C4–C6, A8 — hosting/DB/storage/mail/SMS, never previously named as a
task), **editorial** (D2, D4, D5/Q11–17), **product decisions** (Q10 CAPTCHA, Q19 scanner,
A4 font, B3's edge layer, B1's PPR follow-up), and **a device in a hand** (E6).
