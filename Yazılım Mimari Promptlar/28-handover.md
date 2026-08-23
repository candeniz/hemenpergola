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
| `Yazılım Mimari Promptlar/` | the numbered documents `00`–`28`. **Every bare `NN-*.md` reference in any document resolves here**, including inside the documents |
| `Frontend Tasarım/stitch_outdoor_architectural_marketplace/` | 77 Stitch design screens, `code.html` + `screen.png` each, plus four `DESIGN.md` themes |
| `CLAUDE.md`, `README.md` | repository root |
| `src/`, `prisma/`, `e2e/`, `test/`, `scripts/` | application code |

Both folder names contain a space and Turkish characters. That is deliberate and load-bearing
in `CLAUDE.md` §Layout — do not "tidy" them; the paths appear in `tsconfig.json`,
`next.config.ts` and several scripts.

`Prompt/` at the root was a stale duplicate of three documents. **Deleted 2026-08-23.** Two
ignore-lists still named it and were cleaned with it (`.prettierignore`, `eslint.config.mjs`
§`REFERENCE_DIRS`) — neither would have broken, but a dead ignore entry is a path the next
reader goes looking for.

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

The worker is a second entrypoint from the same image (`23` §Runtime):

```
pnpm worker
```

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

**Two things about this repository that a new session would otherwise assume wrongly:**

*There is no git remote.* Every commit from Phase 0 to here lives only in the local `.git`
directory. Nothing is pushed anywhere. Before doing anything else, confirm the history is
where you think it is.

*CI has never run.* `.github/workflows/ci.yml` is complete — seven stages, the self-opening
integration gate, the route-cache check — and every step in it has been executed locally by
`scripts/ci-local.mjs`, which parses the workflow and runs each `run:` step in job order. But
no GitHub Actions runner has ever executed it, so the runner image, the marketplace actions
(`pnpm/action-setup`, `actions/setup-node`, `actions/upload-artifact`) and the pnpm cache are
unproven. Expect roughly ten minutes of fixing on the first real push. That is not a defect;
it is simply a claim nobody has tested yet, and the difference matters.

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
| 5–9 | not started |

**The gate was proven on 2026-08-23**, on the first working checkout after the blind
session: the full pipeline ran green — typecheck clean on the first pass, one real lint
error (a domain import from `app/`), two test-infrastructure fixes and three spec updates
for behaviour Phase 4 itself changed. `e2e/phase4-gate.spec.ts` passed as written: the
anonymous draft survives a context restart, the claim moves it, and the cookie alone gets a
404 afterwards. `25-progress.md`'s second 2026-08-23 entry has the full list of what broke
and what did not.

Roughly a quarter of the build. The phases carrying the most remaining weight are 5 (matching
and pricing), 6 (offer request lifecycle) and 3's already-completed supply side. `21` calls
Phase 5 "the first demo worth showing anyone" and Phase 6's `e2e/core-flow.spec.ts` is the
release gate.

**Sequencing note:** `26` §Sequencing puts Phase 3 before Phase 4 for a single developer,
against `21`'s claim that they are parallel. That is done; Phase 3 is closed.

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

`24-decisions-log.md` holds ADR-001 to ADR-024, each as context → decision → consequences →
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
time everyone worries about is the wrong one. Q1 (brand) sits upstream of it, because the
sender ID *is* the brand. Q3 (SMS provider) sits downstream. This chain gates the real phone
verification path, which gates contact disclosure in Phase 6. **Not started as of handover.**

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

## 12. What is next

**Verify Phase 4's second half.** It is written and unproven — see §5. `e2e/phase4-gate.spec.ts`
is the gate: an anonymous visitor configures, the browser restarts, the draft survives, they
register and sign in, the draft becomes theirs, and the cookie alone can no longer reach it.
Only when that is green does `25-progress.md`'s Phase 4 row move to ✅.

What follows is the original description of the work, kept because it says why each piece is
shaped the way it is:

- **4.5 anonymous drafts and claiming.** `anonymousKey` httpOnly cookie, 30-day TTL, at most
  three drafts per key, `POST /projects/{id}/claim` on register or login. `26` names this as
  the riskiest task in the phase: it is where sessions, cookies, retention and ownership
  checks intersect, and it is the one flow a customer meets before they trust the product.
  The groundwork is done — the `customer-owned` authorisation shape already carries both
  `userId` and `anonymousKey`, and `ADR-021` already put the configurator on a public route,
  so this adds a cookie and a claim flow rather than a reshaping.
- **4.6 attachments** — `PHOTO` and `DOCUMENT` both, limits in `14-file-storage-and-media.md`
- **4.8 customer dashboard and project list** — `customer_dashboard_final`, `_empty_state`
- **4.9 duplicate project**
- **Gate:** a project reaches `READY` and survives a browser restart mid-wizard. The first half
  already proves this for a signed-in customer; the second half must prove it for an anonymous
  one too.

Then Phase 5 — matching and pricing — which `21` calls the first demo worth showing anyone.
Its engine and golden files already exist, moved forward into Phase 3 deliberately so Phase 5
wires a tested function rather than debugging arithmetic and SQL in the same week.

---

## 13. If you read only one thing after this

`CLAUDE.md`. Nine non-negotiables, and every one of them has a mechanism behind it rather than
an intention. Then `25-progress.md`'s tracker and open questions, then the two or three
documents `README.md` routes your task to.
