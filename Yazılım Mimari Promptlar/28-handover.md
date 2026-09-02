# 28 — Handover

For a Claude session picking this project up cold, on a different account, with none of the
conversation that produced it.

Everything here is a **pointer plus the reasoning that is not written down anywhere else**.
Where a fact lives in another document, this file names that document rather than copying it,
because a copy is a second thing to keep true.

---

## 1. What this is

A marketplace connecting customers who want outdoor architectural systems — pergolas, winter
gardens, glass systems, shading — with verified manufacturers in Turkey. Market Turkey,
currency TRY, default language `tr`, secondary `en`. Web only in V1.

The one flow the whole product exists to serve:

```
discover → configure project → GET OFFERS → matched + priced manufacturers
→ select manufacturer → send request → manufacturer accepts → contact disclosed
→ site survey → final offer → tracked to won/lost
```

What makes it not a lead-gen form: it captures **structured project data** and uses it to
**match** manufacturers by capability and service area, and to **estimate a price** per
manufacturer from that manufacturer's own published price book.

Full version: `00-project-overview.md`.

---

## 2. Where everything is

The repository root is the project folder. Two committed reference folders sit beside the
application code and are excluded from the build, from `tsconfig` and from lint:

| Path | What |
|---|---|
| `Yazılım Mimari Promptlar/` | the numbered documents `00`–`29`. **Every bare `NN-*.md` reference in any document resolves here**, including inside the documents |
| `Frontend Tasarım/stitch_outdoor_architectural_marketplace/` | 77 Stitch design screens, `code.html` + `screen.png` each, plus four `DESIGN.md` themes |
| `CLAUDE.md`, `README.md` | repository root |
| `src/`, `prisma/`, `e2e/`, `test/`, `scripts/` | application code |
| `docs/` | the static landing page served by GitHub Pages (`index.html` + `.nojekyll`, source `master` + `/docs`). **Not documentation** — the numbered documents are in `Yazılım Mimari Promptlar/`; this is a marketing page whose every claim comes from them. No module imports it, and Prettier ignores it |

Both folder names contain a space and Turkish characters. That is deliberate and load-bearing
in `CLAUDE.md` §Layout — and renaming either is not one edit. The build-exclusion list lives
once, in `reference-dirs.mjs` at the root, imported by `eslint.config.mjs`, `next.config.ts`
and `vitest.config.ts`; `.prettierignore` and `tsconfig.json` cannot import and repeat the
names as text, held to the list by `test/reference-dirs.test.ts` (`ADR-029`). Four more files
embed a folder name in a **document path** and are held by nothing:
`scripts/generate-permission-table.mjs`, `permissions.test.ts`, `nav-items.test.ts` and
`performance-templates.test.ts`. Nine places, three of them import — do not "tidy" the names.

`Prompt/` at the root was a stale duplicate of three documents. **Deleted 2026-08-25.** Two
ignore-lists still named it and were cleaned with it (`.prettierignore`, and the list
`eslint.config.mjs` now imports from `reference-dirs.mjs`) — neither would have broken, but
a dead ignore entry is a path the next reader goes looking for.

---

## 3. Start here

In this order, and no more than this on a first visit:

1. `CLAUDE.md` — layout, the nine non-negotiables, the "do not build these" list, conventions,
   definition of done
2. `README.md` — the router: it maps a task to the two or three documents that task needs
3. `00-project-overview.md` — what this is, the stack, the one flow
4. `25-progress.md` — **read the Phase tracker and the Open questions table; skim the log**

`25-progress.md` is ~150 KB and grows every session. It is append-only by design and it is
the recovery mechanism: every phase entry records not just what changed but *why*, including
the reasoning behind decisions that look arbitrary from the diff. Read the last two entries in
full. Do not read all of it.

Then read the two or three documents `README.md` names for the task in hand. **Do not read the
whole set for one feature.** That instruction is in `CLAUDE.md`, it is meant literally, and it
is the difference between good and mediocre output here.

---

## 4. Getting it running

```
docker compose up -d          # postgis/postgis:16-3.4 and MinIO, healthchecked
cp .env.example .env          # defaults match docker-compose.yml line for line
pnpm install
pnpm prisma migrate deploy
pnpm seed demo                # or: minimal | e2e
pnpm dev
```

The demo database **grows as you test it**: a full `pnpm test:e2e` leaves about six projects
and five offer requests behind, every run (measured in 14.7 — `25` §Q38 explains why they are
kept rather than swept). Nothing breaks; the seeded accounts simply accumulate history. Add
`docker compose down -v` in front of the block above to start clean — and do it before showing
the product to anyone (`27` §Before the session).

The worker is a second entrypoint from the same image (`23` §Runtime):

```
pnpm worker
```

**On a physical phone** (`29` §E, E6) `localhost` is the phone, so neither of the above is
reachable and `EXPO_PUBLIC_API_URL` is burned into the APK at build time. One command
replaces both lines above with an HTTPS tunnel in front of them, and starts the stack with
the tunnel's address in its environment:

```
node scripts/tunnel.mjs
```

It prints the address, writes it into `mobile/eas.json` for `eas build`, and takes it back
out on exit — nothing is hand-edited and nothing stale is left. **While it runs the local
server is on the public internet: demo data only, and close it when done.** The account
chain, the build command and the phone-side install are `mobile/TEST-APK.md`; the tool
choice and the two-tunnel reasoning are in the script's own header.

The five commands that must be green before any commit, plus the two suites:

```
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
pnpm test:integration         # testcontainers, real PostGIS + real MinIO
pnpm test:e2e                 # Playwright
```

`pnpm build` must pass **with no `.env` present**. That is not a curiosity — it is a
regression tripwire for non-negotiable 9 (§6 below), and the CI build job runs without one on
purpose. If the build starts needing secrets, configuration has crept back to build time.

Development environment as of handover: Windows, Node 24, pnpm 11, Docker Desktop on WSL2.
Hardware virtualisation had to be enabled in firmware; that is done.

**Two former warnings, both resolved on 2026-08-24:**

*The remote exists now.* `origin` is `https://github.com/candeniz/hemenpergola.git`
(**public**), pushed on 2026-08-24 after a history scan for secrets came back clean — the
only tracked env file in any commit is `.env.example`, and it carries dev placeholders only.
The local branch is `master` and it is the remote's default. **Every commit is pushed from
now on**; a commit that sits only in the local `.git` is the state this warning existed to
end.

*CI has run — seven red runs (#1–#7), then green (run #8, 2026-08-24; the docs-only run #9 confirmed it), and every red found something
real.* In order: pnpm 11 blocks postinstall scripts (`pnpm-workspace.yaml` `allowBuilds`),
so no job had a generated Prisma client and typecheck failed on missing types — invisible
locally where the client had been generated by hand; two test-isolation races the suites
had carried since Phase 2/3, exposed by the runner's two cores ordering files differently
than twelve local workers ever did (catalogue fixture names colliding with the seed's
slugs, and `geo-seed`'s assertions counting other files' fixture cities); the storage tests
assume the compose stack's MinIO on :9000, which `ci-local.mjs` never noticed because the
developer machine always had it running — the same blindness that had left the e2e job with
no database at all; and `docker compose up --wait` failing on the one-shot `minio-init`
container. One CI-only lesson worth keeping: on a public repository, step logs *and* job
summaries are visible only to people with repository access — annotations are the one
channel an anonymous reader can see, so the integration job publishes its failure tail as
one. Every job now generates the Prisma client after install; the integration job starts
MinIO; the e2e job starts the compose stack, migrates and seeds before Playwright.

---

## 5. State of the build

Ten phases, defined in `21-development-roadmap.md` (scope and gates) and
`26-execution-plan.md` (ordered tasks, evidence per task, decision calendar).

| Phase | Status |
|---|---|
| 0 Foundation | ✅ gate met · 17/17 |
| 1 Identity | ✅ gate met · 9/9 |
| 2 Catalogue + admin skeleton | ✅ gate met · 7/7 |
| 3 Manufacturer supply side | ✅ gate met · 8/8 |
| 4 Project configurator | ✅ gate met · 9/9 |
| 5 Matching + pricing | ✅ gate met · 9/9 |
| 6 Offer request lifecycle | ✅ gate met · 10/10 — `core-flow.spec.ts` walks all nine F1 steps |
| 7 Communication + trust | ✅ gate met · 3/3 |
| 8 Public site + SEO | ✅ gate met · 5/5 — the five-template Lighthouse gate runs strict in CI |
| 9 Hardening + launch | 🟡 **code complete, launch not** — 18 checklist items evidenced, 18 waiting on people and infrastructure (`29-launch-checklist.md`) |

### The distinction this table exists to make

**The code is finished. The product is not launched.** Those are different sentences and
Phase 9 is where they separate.

Everything a programmer can do is done: the nine-step release gate is green, the five
public templates meet their budgets in CI, KVKK export/erasure/retention work end to end,
the security headers are on, every queue has a handler, every notification event has both
a template and a trigger. **There is no remaining code task** — not "none prioritised",
none. If you are a coding session and looking for the next feature, there isn't one; read
§12 and check whether the thing actually blocking launch is something you can help with
(mostly it is not).

What remains is a company, a lawyer, an SMS provider, a hosting account, an editorial
afternoon with a real manufacturer, and half an hour with an Android phone. `29` lists
each with its owner.

### What exists and works

- Typed environment validated at **server startup**, never at build (`23` §Configuration)
- Full design token system on Tailwind 4 `@theme`, 24 shadcn primitives restyled centrally,
  four shells with the density split, `/dev/tokens` and `/dev/ui` as verification surfaces
- next-intl, `tr` unprefixed and `en` prefixed, no `Accept-Language` negotiation (`ADR-018`)
- Seven-stage CI whose integration stage opens itself (§6)
- Prisma + PostGIS, six migrations, one per phase (`ADR-014`)
- 81 provinces and 974 districts with centroids, CC BY 4.0 from GeoNames
- Identity: Argon2id, server-side sessions (`ADR-022`), Bearer JWT for `/api/v1`, permission
  catalogue, authorisation matrix enforced by the build
- Catalogue: admin CRUD with no deploy, seed catalogue with two fully specified products
- Supply side: company profile and documents, product offering, service areas of all three
  kinds, portfolio, price books with draft → publish → archive, the pure pricing engine with
  committed golden files, and the simulator
- Configurator first half: three stages over ten steps, per-step persistence, derived area,
  attribute rendering, readiness with step-tagged issues
- Configurator second half, **unverified**: anonymous drafts owned by an httpOnly cookie key
  (`ADR-023`), single-statement claiming, three drafts per key, `PHOTO`/`DOCUMENT` attachments
  in the semi-private class, the customer dashboard, duplicate, and per-segment auth gates
  (`ADR-024`, closing Q24)

---

## 6. The enforcement machinery — do not weaken this

This repository has spent four phases building mechanisms that make its own rules
self-enforcing. They are the most valuable thing in it, and each one exists because something
went wrong once. A new session should treat them as load-bearing.

**Four architectural lint rules, each proved by a committed fixture.** No raw palette names
under `src/components`; no bare user-facing strings in JSX; `app/` may import only from
`application/`; nothing under `src/app` evaluates configuration or the database at module
scope. Every rule is proved **in both directions** — a fixture that must fail, and the correct
shape that must pass. A rule proved only by a failing fixture is half proved: a rule that also
fires on the right shape gets suppressed, and the suppression is what the next person copies.

All four also match **dynamic** `import()`, except non-negotiable 9's group, which deliberately
does not — there the dynamic import *is* the fix. That distinction is the whole point: 9 is
about *timing*, the other three are about *layering*, and a dynamic import stops violating the
first while merely hiding the other three. One documented hole remains: a computed specifier
(`import(someVariable)`) cannot be matched by a syntax rule.

**The authorisation matrix.** Two halves, because either alone leaks. A type: `serviceMethod()`
cannot be called without an authorisation spec, and the spec is a closed union. A scan: a unit
test walks every `modules/*/application/*.ts` from disk and fails the build on an unregistered
method. It is a unit test on purpose — pure static analysis, so it gates every `pnpm test`, not
only the stage that needs a container.

**Zero exemptions.** Three times a rule caught something that looked like it deserved an
exception: `checkHealth`, the pg-boss job handlers, and two dev-only routes. Every time the
right answer was to **move the code**, not to exempt it. The single exemption that does exist
(`checkHealth`) is pinned by a test asserting the list has exactly one entry. Keep it that way.

**Golden files for pricing.** Committed `(project, price book)` fixtures with expected
breakdowns. Changing a golden value must be a deliberate line in the PR and must bump
`engineVersion`; both a regression test and a checksum gate fire. Proven by tampering with one
kuruş.

**`check-dynamic-routes.mjs`.** Reads Next's real `prerender-manifest.json`, not the source,
because a parent layout's `revalidate` silently overrides `force-dynamic` and a grep would pass.
It enumerates the `(public-owner)` route group rather than naming routes, and fails if a route
is missing from the build, or if the group itself vanishes.

**CI's integration stage opens itself.** `scripts/ci-integration.mjs` skips loudly when there
is no Prisma schema, and **fails** when there is a schema but no integration tests. A stage that
quietly passes with nothing in it reads green and proves nothing.

---

## 7. Decisions

`24-decisions-log.md` holds ADR-001 to ADR-025, each as context → decision → consequences →
what would reverse it. Read it once; it is the cheapest way to stop re-arguing settled things.

The five that shape the most code:

- **ADR-005** money is integer kuruş end to end; a `Float` money column is a review-blocking
  defect
- **ADR-006** estimates are per manufacturer and the customer sees a **rounded band**, never
  line items; the market aggregate is admin-only
- **ADR-008** no configurator rules engine — a flat attribute set plus one level of `showIf`
- **ADR-010** payments, subscriptions and lead credits are **modelled, not built**; their admin
  screens exist as designs and are absent from the navigation, defended by a test
- **ADR-014** one migration per phase, named for it

Two that are easy to miss and expensive to get wrong:

- **ADR-021** the configurator is a **public** route (`/proje/yeni`, `/proje/[id]`); the account
  wall stands at "get offers". It lives in a `(public-owner)` route group whose layout sets
  `force-dynamic`, because `(public)` is otherwise ISR-cached and these pages carry personal
  data. `noindex` does not address caching.
- **ADR-022** supersedes `ADR-003`'s web half: server-side sessions, not Auth.js cookies,
  because Auth.js's Credentials provider forces a stateless JWT and `12` §Sessions and
  revocation requires a device list and individual revocation.
- **ADR-023** the anonymous draft key is a **ninth field on `ActorContext`**, not an argument
  threaded through each service's input. Forgetting to pass it would produce a silent
  `NOT_FOUND` — the row simply not matching — rather than an error, and identity is resolved in
  one place for the same reason `12` gives. It is carried through sign-in on purpose, because
  claiming needs both identities in one request; `ownedBy()` gives `userId` precedence.
- **ADR-024** "auth-gated" is a `layout.tsx` per segment. `07` had described `(customer)` that
  way since Phase 0 with nothing enforcing it (Q24). Not the middleware — `12` §Authorization
  splits authentication from authorisation, and the edge has no database. The layout decides
  who sees a *shell*; the services still decide who sees a row.

---

## 8. How work has been sequenced

A rhythm worth keeping, because it produced the state above:

1. **Half a phase per prompt.** Nine tasks in one prompt degrades; four or five does not.
2. **Gates are proven, not asserted.** `26-execution-plan.md` gives every task an evidence
   column. A phase row moves to ✅ only when its gate is demonstrated — commands run, output
   reported. `25`'s tracker has three states (`⬜` / `🟡 n/m` / `✅`) because "not started"
   was once true of a phase that was 85% built, and that is wrong information rather than a
   rounding error.
3. **`25-progress.md` is updated every time**, with reasoning, not just a changelog.
4. **One commit per half**, except when a broken tree meets a long context — then take an
   interim green commit and an interim log entry. The history costs one line; the alternative
   costs hours.
5. **Documentation wins over code.** When they disagree, fix the document and write an ADR;
   `CLAUDE.md` §When the documentation and the brief disagree. Five contradictions have been
   resolved this way so far, none in a code comment.
6. **Anything deferred becomes an entry in `25` §Open questions.** This rule exists because
   Phase 1's report declared Auth.js deferred, it never reached the question table, and it
   surfaced three phases later underneath a failing end-to-end test.

---

## 9. Open questions

The live table is `25-progress.md` §Open questions — twenty-odd entries, each with what it
blocks and the default if unanswered. Do not work from this summary; work from that table.

Four matter more than the rest:

**Q2 — legal entity, İYS registration, KVKK counsel.** Runs on wall-clock, not on code
velocity, and it is the longest external lead time in the project. A Turkish alphanumeric SMS
sender ID is allocated only to an İYS-registered business, which needs a registered company;
the provider's own approval of the header is short (commonly 1–3 business days), so the lead
time everyone worries about is the wrong one. **Q1 closed 2026-08-24 — the brand is "Hemen
Pergola"** — which unblocks this chain's upstream end; note the GSM alphanumeric field is 11
characters, so the sender ID will be an *abbreviation* decided with the İYS application, not
the full name (it lives in configuration, hardcoded nowhere). Q3 (SMS provider) sits
downstream. This chain gates the real phone verification path, which gates contact
disclosure in Phase 6. **Not started as of handover.**

**Q18 — do snow and wind load affect size limits, or only price?** If only price, the model
already handles it. If limits, `ProductAttribute.max` must vary by region and the schema
cannot express that. `dimensionBounds()` in `modules/project/domain/steps.ts` is the single
read point, and it already takes a context carrying city and district that nothing reads yet,
so no caller can forget to pass them when the answer arrives. Needs a manufacturer to answer.

**Q11–Q17** — catalogue content questions, all of them for the pilot manufacturer.

**Q19, Q20, Q22, Q25** — infrastructure and correctness debts with named owners. Q19 in
particular: uploads are accepted as clean because `scan()` returns `CLEAN` unconditionally.
The gate is built and enforced; the scanner is not chosen. That is "waiting", not "done", and
the distinction should stay visible. Q25 is the same shape and new in Phase 4: the
anonymous-draft retention rule is written and unit-tested, and nothing runs it — the sweep
belongs to Phase 9's retention set.

**Q24 and Q21 are closed** (`ADR-024`, and the dynamic-import lint extension). Q21 is worth one
sentence of its own: it was closed in the *log* on 2026-08-16 and stayed live in the *table*
for a week, because `CLAUDE.md` §Definition of done requires a deferral to reach the table and
says nothing about the closure.

---

## 10. Two workstreams that are not code

Both were named in `26-execution-plan.md` §Before Phase 0 as parallel workstreams that should
have started during Phase 0. Neither has started.

**D3 — a pilot manufacturer.** The largest un-derisked assumption in the project is whether
price-book data entry is too laborious for a real manufacturer. That is not retired by design
review; it is retired by watching one person fill one book in and noting where they stop. The
screen is built. `27-d3-pilot-guide.md` is the one-page guide for that session, the `demo`
seed carries an account for it, and Q11–Q18 are its agenda. Q18 blocks Phase 4's second half
conceptually and Phase 5 concretely.

**Q2 — the legal entity.** See §9.

Code velocity has been steady for four phases. Neither of these moves with it.

---

## 11. Traps that have already bitten

Recorded so they do not bite twice. Each cost real time.

- **`tailwind-merge` silently dropped the type scale.** `cn('text-body-sm', 'text-muted')` →
  `'text-muted'`, because a custom named font size looks like a colour. Every component setting
  a size and a colour in one call lost its font size. `src/lib/utils.ts` now teaches
  tailwind-merge the token scales and `utils.test.ts` pins the vocabulary to `globals.css`.
- **`max-w-md` was 24 pixels.** A custom `--spacing-md` shadows Tailwind's container scale.
  Every dialog in the app was 48 px wide from Phase 0, and `/dev/ui` did not catch it because
  the gallery rendered triggers rather than open overlays. It now renders them open.
- **A middleware matcher lost one backslash.** `'.*\..*'` means "any path of two or more
  characters", so `/` worked while every unprefixed Turkish route 404'd — which looks exactly
  like locale routing being fine.
- **`SHOW lc_collate` does not exist in PostgreSQL 16.** Read `pg_database.datcollate`.
- **A Phase 2 test faked a table Phase 4 later created, and dropped it in a `finally`.**
  Harmless until the table became real; then it dropped it out from under every later test in
  the shared database, and the symptom was six failures in unrelated seed tests.
- **Testcontainers' `container.start()` resolves before Postgres listens.** The image runs a
  temporary server for `initdb` that also logs "ready to accept connections", so a log-based
  wait matches the wrong one. Poll instead.
- **Configuration crept back to build time twice**, once via a layout and once via a route
  handler, both importing `env` at module scope. Non-negotiable 9 and the no-`.env` build job
  exist because of this.
- **Generating file content through the shell ate backticks**, and a comment lost every
  document reference while its test still passed. Comments carry the reasoning in this
  repository. Edit files directly; read back anything generated.

---

## 12. What is next — and it is not code

The next actor on this project is not writing software. They are registering a company,
talking to a lawyer, choosing a host, and sitting down with a pilot manufacturer. This
section is written for that person.

**The one document to work from is `29-launch-checklist.md`.** Every pre-launch item is
there with either its evidence (a test or run name) or the named thing it waits on. 18
items are evidenced; 18 are waiting; none are unstarted. This section is the map of those
18, in the order the dependencies actually allow.

### Chain 1 — Q2 legal. Start today; everything else is shorter.

```
legal entity  →  İYS registration  →  SMS sender ID  →  real phone verification
                                                     →  production contact disclosure
```

This is the longest wall-clock chain in the project and **none of it can be
parallelised**. An alphanumeric Turkish SMS sender ID is issued only to an İYS-registered
business; İYS registration needs a registered company. The provider's own approval of the
header is the short part (commonly 1–3 business days) — the lead time everyone worries
about is the wrong one.

What it unblocks: `29` rows A5 (privacy notice, cookie notice, terms, consent text —
reviewed by a Turkish lawyer, versioned in `shared/legal/`), A6 (VERBİS), A7 (processor
agreements for mail, SMS, hosting, storage, geocoding, error tracking), C2 (an error
tracker may not be wired before its processor agreement exists — `19` §Data location),
E5 (an SMS and an email actually arriving).

Note for the sender ID: **the brand is "Hemen Pergola" and it does not fit** — the GSM
alphanumeric field is 11 characters. The abbreviation is a decision to make with the İYS
application. It lives in configuration; nothing in the code hardcodes it.

### Chain 2 — Provisioning. Nothing blocks it. Nothing scheduled it either.

Hosting, managed Postgres (with PostGIS), object storage, a mail provider, an SMS
provider. **This was never named as a task in any document until `29` existed** — it is
not a phase, so no phase owned it, and it is the single most likely thing to be discovered
late.

Every one of them sits behind a port or an environment variable that already exists:
`StorageProvider`, `Mailer`, `SmsSender`, `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`. Choosing
a provider is a configuration change plus, for mail and SMS, one adapter file each.

It unblocks `29` rows C4 (backup restore rehearsal — there is nothing to rehearse against
today), C5 (the worker's production image: `23` §Runtime specifies `node dist/worker.js`
and no Dockerfile target exists — Q20), C6, A8 (the append-only GRANT on `AuditLog` needs
a production role), C10 (capacity sizing on real hardware) and B6 (Dependabot: one
repository setting).

**Domain name:** undecided, and deliberately not hardcoded anywhere. `NEXT_PUBLIC_SITE_URL`
feeds every canonical URL, the sitemap and the JSON-LD through `shared/seo/site-url.ts`.
Choosing it is a one-line `.env` change.

### Chain 3 — Editorial. Needs a manufacturer in a room, not a keyboard.

`27-d3-pilot-guide.md` is a one-page script for that session, with a seeded login and
Q11–Q17 phrased as questions to ask. The pilot account deliberately has **no price book** —
building one from nothing is the thing being observed.

It unblocks `29` rows D5 (the catalogue's open questions), D2 (a price guide per seed
product), D4 (three portfolio-bearing profiles per launch city). And it feeds Q5: which
cities launch is answerable from real data — `MatchRun` records zero-result runs per city
and the query works today.

### Chain 4 — Product decisions. Each is a choice with a cost.

- **B3b — the 5 offer-requests/hour limit** was written before the flow existed. A
  customer comparing three quotes legitimately sends three requests in one sitting. Wired
  as specified; changing the number is a product call, not a bug fix.
- **B3 — `publicRead` 300/min/IP** needs an edge or CDN layer: a database-backed limiter
  cannot see requests that ISR serves from cache.
- **B4 (Q10)** — CAPTCHA provider and its KVKK assessment. The port exists; today there is
  progressive delay and a lockout notice, no hard lock.
- **B5 (Q19)** — virus scanner. `virusScanStatus` already gates serving; nothing scans.
- **B1** — the public pages carry no `script-src`, and those are exactly the pages that
  render third-party text. Closing it means PPR or a JS-free public shell.

### Chain 5 — One device, half an hour.

`29` row E6: one full pass on a mid-range Android over a slow connection. The CI budgets
are lab numbers under a fixed condition and say so (`18` §Performance budgets); they are
not a claim about what a real phone on a real network sees. This is the cheapest item on
the entire list and the only one that needs nothing bought and nobody consulted.

---

## 12b. If a coding session lands here months from now

Do these four things before touching anything:

1. **Run the suites.** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`,
   then `pnpm test:integration` and `pnpm test:e2e`. They were green at handover
   (1000+ unit, 340+ integration, 60+ e2e). A red suite is the first thing to understand —
   dependency drift is the likely cause, not a regression in logic.
2. **Look at CI.** `github.com/candeniz/hemenpergola` — the pipeline runs the whole thing
   on every push, including the performance gate. On a public repository an anonymous
   reader sees only *annotations*, which is why the Lighthouse stage publishes its numbers
   and the runner's `benchmarkIndex` as one.
3. **Read `25-progress.md` §Open questions.** It is short, it is the table nobody re-reads
   the log for, and it holds what was deliberately deferred with the reason and the phase
   that owns it. Then read the last two dated log entries in full — not the whole log.
4. **Read `29-launch-checklist.md`** to find out whether the work in front of you is
   actually code. Most of what remains is not, and building the wrong thing well is the
   expensive mistake available here.

Then `README.md` routes your specific task to its two or three documents. **Do not read the
whole documentation set for one feature** — `CLAUDE.md` means that literally.

---

## 13. If you read only one thing after this

**If you are here to launch:** `29-launch-checklist.md`. Eighteen items are done and
evidenced; eighteen are waiting on you, each with an owner and the thing it depends on.
Start Chain 1 (the legal entity) today, because it is the only one that cannot be hurried
later.

**If you are here to write code:** `CLAUDE.md`. Nine non-negotiables, and every one of
them has a mechanism behind it rather than an intention. Then `25-progress.md`'s tracker
and open questions, then the two or three documents `README.md` routes your task to. And
read §12b above first — the honest answer to "what should I build next" is currently
"nothing; the build is done".
