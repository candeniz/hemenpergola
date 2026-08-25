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
| A1 | Data export works end to end, subject-only content, signed 30-day link | ✅ | **end to end now means end to end.** `privacy.integration.test.ts` proves export → mail → token download with no line items and no received messages; `e2e/account-data.spec.ts` proves a signed-in customer can reach `/hesap/verilerim` and ask for it. The ✅ before 10.2 was wrong: the service was proven and its entry point did not exist |
| A2 | Erasure works and is anonymisation, never hard delete | ✅ | **Q30 closed 2026-08-25 (10.3): `19`'s full "request → verification → anonymisation" chain exists.** `requestAccountErasure` emails a one-hour single-use `ACCOUNT_ERASURE` token; `confirmAccountErasure` consumes it race-safely and anonymises. `privacy.integration.test.ts` walks the whole loop — request sends the mail and touches nothing, the captured token confirms, personal fields clear, commercial ids survive, the replayed token is refused. `e2e/account-data.spec.ts` proves the form's three gates in a browser |
| A3 | Retention sweep runs, dry-run first, legal-hold untouchable | ✅ | `retention-policy.test.ts` (empty intersection, structurally) + `privacy.integration.test.ts` (dry-run = applied, evidence survives, idempotent) |
| A4 | Export PDF rendering | ✅ | `export-pdf.ts` + `privacy.integration.test.ts` — a real PDF with an EMBEDDED OFL subset (`fonts/LICENSE-noto-sans.md`) that carries `ı İ ş Ş ğ Ğ ₺`; the standard-14 faces cannot, and the first font found in the tree was rejected after reading its cmap |
| A5 | Privacy notice, cookie notice, terms, consent text — lawyer-reviewed, versioned | ⏳ | bekliyor: **9.2 / Q2** — Turkish counsel; `shared/legal/` carries the versioned texts to review |
| A6 | VERBİS registration assessed | ⏳ | bekliyor: **Q2** — legal entity first |
| A7 | Processor agreements (mail, SMS, hosting, storage, geocoding, error tracking) | ⏳ | bekliyor: **Q2 chain + provisioning** — no processor is wired that is not contracted; the ports (`Mailer`, `SmsSender`, `ErrorTracker`, `StorageProvider`) are the seams |
| A8 | Audit log append-only enforced by a database GRANT | ⏳ | bekliyor: **9.4 / provisioning** — needs the production role; the application never issues UPDATE/DELETE on `AuditLog` (source-greppable) but the grant is the guarantee |

## B · Security (`19` §Application security)

| # | Item | Status | Evidence |
|---|---|---|---|
| B1 | CSP without `unsafe-inline` for scripts, nonce-based, app still works | ✅ (two-profile) | `public-directory.spec.ts` §9.3 — nonce on strict surfaces, headers asserted, login interactive under policy; release gate 9/9 under it. **Read the gap precisely:** the pages that carry NO `script-src` are exactly the pages that render third-party-authored content — CMS blocks, manufacturer display names, portfolio titles, review bodies. The residual risk is narrow because the block union refuses raw HTML and React escapes every string (`blocks.test.ts` asserts both), but the defence-in-depth layer is missing precisely where untrusted text is rendered. Closing it: PPR or a JS-free public shell — see `19` §Headers |
| B2 | HSTS, nosniff, referrer-policy, permissions-policy on every response | ✅ | `public-directory.spec.ts` §9.3 header assertions |
| B3 | Rate limits live on the surfaces `06` names | ✅ (4 of 6) | auth since Phase 1; `offerRequestCreate` 5/h/user and `priceEstimate` 30/h-user + 60/h-IP wired 2026-08-24 in the services. `messages` 60/h/thread lives in `message-service`; `privacy` 5/h/account (export request + erasure request — each call is one emailed token) added 2026-08-25 with the erase endpoint, because an irreversible surface must not be the unmetered one. `publicRead` 300/min/IP: ⏳ bekliyor: edge/CDN layer — a DB-backed limiter cannot see ISR cache hits |
| B3b | **`06`'s 5 offer-requests/hour/user may be too tight for the real flow** | ⏳ product decision | The limit was written before the flow existed. A customer comparing three quotes legitimately sends 3 requests in one sitting, and a second round after a decline puts them at the ceiling — the limiter cannot tell that from abuse. Wired as specified in 9.3 and **deliberately not changed in code**; bekliyor: **a product decision** on the number (and whether the window should be per-project rather than per-user) |
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
| C7 | Load test of the matching path | ✅ | `scripts/load-test-matching.ts` — 2026-08-24: 0 errors through 120 concurrent, no pool exhaustion or lock contention. **The number that matters is the knee, not the absence of errors** — see C10 |
| C8 | Matching p95 budget in CI | ✅ | `match-performance.integration.test.ts`, every CI run |
| C9 | Performance budgets on the five templates in CI | ✅ | the lighthouse job, every CI run since #15 |
| C10 | **Capacity of the matching path — stated, not implied** | ✅ measured, ⏳ sized | Phase 5's gate promise (p95 ≤ 2.5 s) holds **to roughly 40 concurrent users on the dev machine**: p95 was 1.36 s at 40 and 3.4 s at 80, so the SLA line is crossed between them. Degradation is linear queueing, not collapse. bekliyor: **provisioning** — the same measurement on the real host is what turns "~40 here" into a capacity plan, and `scripts/load-test-matching.ts` is the instrument |

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
| E3 | Turkish characters in PDFs | ✅ | `privacy.integration.test.ts` — the export PDF renders `Işıl Şahingöz`, `İstanbul`, `Ağustos` and `₺` through the embedded subset; pdfkit refuses a character the subset lacks, so a narrowed subset fails there rather than in a download |
| E4 | KDV arithmetic on a real offer vs hand calculation | ✅ | `offer-math.test.ts` + core-flow step 7's on-screen totals |
| E5 | An SMS and an email actually arriving | ⏳ | bekliyor: **Q2→Q3** — providers; log adapters prove the seams |
| E6 | Full pass on a mid-range Android over a slow connection | ⏳ | bekliyor: **9.8 — a physical device**; the lab budgets are not this (`18` §What these numbers claim) |

## Summary

**Evidenced: 18 · Waiting on a named human or infrastructure step: 18 · Not started: 0.**
(Two rows count in both columns — B3 has one of five surfaces waiting on an edge layer,
C10 is measured here and unsized on real hardware.)

**There is remaining code work, and pretending otherwise is how A1 kept a ✅ it had not
earned.** The sentence that stood here until 2026-08-25 said the opposite. What it meant was
"no remaining code work *that this checklist was tracking*", and the gap it could not see was
that a checklist row proving a **service** says nothing about whether a **person can reach
it**: `requestDataExport` and `anonymiseAccount` had authorisation entries, passing
integration tests and no page, no action and no route. `test/api-surface.test.ts` found it by
counting capabilities rather than adapters.

Phase 10.2 built those surfaces. Phase 10 as a whole — the rest of `/api/v1` — and Phase 11,
the mobile application (`ADR-030`), are open. Neither blocks this list: the web launches
first and the app enters the stores afterwards, which is a constraint written into `ADR-030`
because store review needs A5 and C6.

Every waiting row below names a person or a purchase, not a
programmer. The waiting set decomposes into five chains, and this is who owns each:

| Chain | Owner | Rows | Note |
|---|---|---|---|
| **Q2 legal** | founder + Turkish counsel | A5, A6, A7, C2 (provider), E5 | The longest chain by wall-clock, and the one everything else waits behind: legal entity → İYS registration → SMS sender ID → real phone verification → the production contact-disclosure path |
| **Provisioning** | founder / whoever holds the accounts | C4, C5, C6, A8, C10 (sizing), B6 | Hosting, managed Postgres, object storage, mail, SMS. **Never named as a task in any document before `29` existed** — it is not a phase, so nothing scheduled it |
| **Editorial** | founder + pilot manufacturer | D2, D4, D5 | Price guides, real portfolios, and the catalogue answers Q11–Q17 (`27-d3-pilot-guide.md` is the script for that session) |
| **Product decisions** | founder | B3 (edge layer), B3b (request limit), B4 (Q10), B5 (Q19), B1 (PPR follow-up) | Each is a choice with a cost, not a gap in the build |
| **A device in a hand** | anyone with an Android phone | E6 | Half an hour, and the only item here that needs nothing bought and nobody consulted |

The dependency that matters: **nothing in the Q2 chain can be parallelised away.** SMS
cannot be tested before a sender ID exists; a sender ID needs İYS registration; İYS needs a
registered company. Everything else — provisioning, editorial, the device — can start
today, in any order.
