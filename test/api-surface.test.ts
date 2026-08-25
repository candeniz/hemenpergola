import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * `05-system-architecture.md` §Two entry points, as a test:
 *
 *   *"A feature is not 'done' if it works through a server action but has no route-handler
 *   path, because the mobile app consumes `/api/v1` and a retrofitted API is a rewrite."*
 *
 * **The universe is the capability, not the server action.** The first version of this test
 * enumerated `src/app/actions/*.ts` and asked whether each action had an endpoint. That
 * measured the wrong population and under-reported by a third: a service method reached
 * only from a Server Component — `getMatchRun`, `getOffersForRequest`, `listLeadsForCompany`
 * — has no action to be missing an endpoint for, and those reads are most of what a mobile
 * screen renders. `09` §Pipeline stores a `MatchRun` precisely so that returning to the page
 * does not recompute it; nothing exposed that stored run over HTTP.
 *
 * So the population is every method registered with `serviceMethod()`, and each is in
 * exactly one of three states: reachable through a route handler, on `WEB_ONLY` with a
 * written reason, or missing.
 *
 * **Matching is on the service method, never on names or paths.** Both entry points are
 * adapters over the same application service, so "there is an endpoint for this capability"
 * means "some route names this method". That survives REST-shaping of the URL, which the
 * rule does not care about — and it dissolves false exceptions: `patchStepAction` had to be
 * exempted by name in the action-level version, while at capability level `patchStep` is
 * plainly reachable through `PATCH /api/v1/projects/{id}`.
 */

const APP_DIR = join(process.cwd(), 'src', 'app')
const ACTIONS_DIR = join(APP_DIR, 'actions')
const V1_DIR = join(APP_DIR, 'api', 'v1')
const MODULES_DIR = join(process.cwd(), 'src', 'modules')

/**
 * The only capability that cannot be an HTTP endpoint — one entry, and the bar it had to
 * clear is written below.
 *
 * **This list answers "can this exist as an endpoint at all?", not "will the mobile app
 * show this screen?"** The two questions were conflated in the first version, which
 * exempted the admin CMS editor as "wide-screen work". That reason does not survive
 * contact with the codebase: admin catalogue, admin settings and admin verification are
 * equally wide-screen operator work, all three have complete `/api/v1/admin` trees, and
 * `06` §Admin says the admin API mirrors `17-admin-system.md` in full. `moderateReview`
 * was never exempted at all. Same category, opposite treatment.
 *
 * `ADR-030`'s scope table governs what the *application renders*. It does not govern what
 * the API *exposes* — an endpoint nobody has built a phone screen for still belongs to
 * scripts, the admin console, integrations and the next client. So the CMS editor came off
 * this list and is simply missing.
 *
 * What is left is transport, not audience: `endWebSession` takes a `sessionToken` that only
 * ever exists as an `httpOnly` cookie (`ADR-022`). The service's own comment states the
 * split — *"`logout` revokes an API refresh-token family, this deletes a `Session` row […]
 * a mobile client has no cookie."* The mobile half is `logout`, which `06` §Auth specifies
 * as `POST /auth/logout` and which is in this file's missing list, where it belongs.
 */
const WEB_ONLY: Record<string, string> = {
  endWebSession:
    'deletes the Session row addressed by an httpOnly cookie (ADR-022); a token client has no cookie and uses `logout`, which exists as POST /auth/logout',
  listPublicSlugs:
    'feeds sitemap.xml, and sitemap.xml IS this capability HTTP surface — a crawler-facing web artifact (18 §SEO). An /api/v1/slugs twin would be a second copy of the same enumeration with no client: a phone navigates the directory, it does not crawl it',
}

/**
 * Capabilities that are **components, not features** — deliberately callable by other
 * services and by tests, and deliberately not addressable from outside.
 *
 * A third list rather than a line in either of the other two, because the reason is
 * different again: `WEB_ONLY` is "cannot be HTTP", `NO_SURFACE` is "should be reachable and
 * is not". This one is "reachable by the only callers it has". Keeping a legitimate helper
 * in the defect inventory would be worse than untidy — that list is meant to reach zero, and
 * a permanent resident in it turns a signal into a number nobody reads.
 */
const INTERNAL: Record<string, string> = {
  listCompaniesCoveringPoint:
    'the Phase 5 eligibility filter in miniature, exposed so that `20` §Integration can test the just-inside / just-outside-radius boundary against the real SQL rather than reimplementing it; it answers with company ids for a point, which is the matching pipeline s own input and not a question a client asks',
}

/**
 * Capabilities reachable from **no surface at all** — not a route, not an action, not a
 * page. Pinned rather than filtered, in the discipline the rest of the suite uses, so that
 * a new one cannot appear unnoticed.
 *
 * This is a defect inventory, not an exemption: every entry is also counted as missing
 * below. It exists because "built, permission-checked, integration-tested, unreachable" is
 * a distinct failure from "web-only", and the two were indistinguishable while the test
 * enumerated actions.
 *
 * It held seven entries when this test was widened, and it holds none now. Five were the
 * account's own controls over its own data — export, erasure, and both halves of
 * notification preferences — plus the token `logout`; a user could not exercise a KVKK
 * right from any surface at all. Phase 10.2 built `/hesap/verilerim` and the endpoints
 * behind them; 10.4 exposed the last one, `estimateForProject`, built in Phase 3 for the
 * compare screen and reachable from nothing for seven phases. The empty list is the
 * assertion: the next capability built without a surface fails this test on arrival.
 */
const NO_SURFACE: string[] = []

type Action = { file: string; name: string; serviceMethods: string[] }

const words = (text: string): Set<string> =>
  new Set([...text.matchAll(/[A-Za-z_]\w*/g)].map((match) => match[0]))

function walk(dir: string, onFile: (path: string) => void): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, onFile)
    else onFile(path)
  }
}

/** Every method registered with `serviceMethod()`, mapped to the module that owns it. */
function registeredServiceMethods(): Map<string, string> {
  const owner = new Map<string, string>()
  walk(MODULES_DIR, (path) => {
    if (!path.includes('application') || !path.endsWith('.ts') || path.endsWith('.test.ts')) return
    const parts = path.split(sep)
    const owningModule = parts[parts.indexOf('modules') + 1] as string
    for (const match of readFileSync(path, 'utf8').matchAll(
      /export const (\w+) = serviceMethod</g,
    )) {
      owner.set(match[1] as string, owningModule)
    }
  })
  return owner
}

/** Registered methods named by files under `root` that satisfy `include`. */
function methodsNamedUnder(
  root: string,
  include: (path: string) => boolean,
  services: Set<string>,
): Set<string> {
  const found = new Set<string>()
  walk(root, (path) => {
    if (!include(path)) return
    for (const word of words(readFileSync(path, 'utf8'))) if (services.has(word)) found.add(word)
  })
  return found
}

/** Every exported server action, with the registered service methods its body names. */
function exportedActions(services: Set<string>): Action[] {
  const actions: Action[] = []

  for (const entry of readdirSync(ACTIONS_DIR)) {
    if (!entry.endsWith('.ts')) continue
    const source = readFileSync(join(ACTIONS_DIR, entry), 'utf8')
    const starts = [...source.matchAll(/export async function (\w+)/g)]

    starts.forEach((match, index) => {
      const body = source.slice(match.index ?? 0, starts[index + 1]?.index ?? source.length)
      actions.push({
        file: entry,
        name: match[1] as string,
        serviceMethods: [...words(body)].filter((word) => services.has(word)),
      })
    })
  }

  return actions
}

describe('05 §Two entry points · every capability has a /api/v1 path', () => {
  const owner = registeredServiceMethods()
  const services = new Set(owner.keys())

  const api = methodsNamedUnder(V1_DIR, (p) => p.endsWith('route.ts'), services)
  const fromActions = methodsNamedUnder(ACTIONS_DIR, (p) => p.endsWith('.ts'), services)
  const inApp = methodsNamedUnder(APP_DIR, (p) => /\.tsx?$/.test(p), services)
  const fromPages = new Set([...inApp].filter((m) => !fromActions.has(m) && !api.has(m)))

  const missing = [...services]
    .filter(
      (method) =>
        !api.has(method) && WEB_ONLY[method] === undefined && INTERNAL[method] === undefined,
    )
    .sort()

  const label = (method: string): string => `${owner.get(method) ?? '?'} · ${method}`

  it('found a population large enough to be the real one', () => {
    expect(services.size).toBeGreaterThan(100)
    expect(api.size).toBeGreaterThan(20)
  })

  /*
   * Kept from the action-level version, because it is what catches a broken extraction: an
   * action naming no registered method means the scan stopped understanding the calling
   * convention, not that a capability vanished. The action files use four of them.
   */
  it('resolves every server action to at least one registered service method', () => {
    const unresolved = exportedActions(services)
      .filter((action) => action.serviceMethods.length === 0)
      .map((action) => `${action.file} · ${action.name}`)

    expect(unresolved, 'actions whose service method could not be resolved').toEqual([])
  })

  it('exposes every registered capability through /api/v1, or names it web-only', () => {
    const byReach = {
      action: missing.filter((m) => fromActions.has(m)).map(label),
      page: missing.filter((m) => fromPages.has(m)).map(label),
      nowhere: missing.filter((m) => !fromActions.has(m) && !fromPages.has(m)).map(label),
    }

    expect(
      missing.map(label),
      `${missing.length} of ${services.size} capabilities have no /api/v1 path\n` +
        `  reachable from a server action: ${byReach.action.length}\n` +
        `  read only by a Server Component: ${byReach.page.length}\n` +
        `  reachable from no surface at all: ${byReach.nowhere.length}\n` +
        `${JSON.stringify(byReach, null, 2)}`,
    ).toEqual([])
  })

  it('keeps the unreachable-capability inventory pinned, so a new one cannot appear quietly', () => {
    const nowhere = [...services]
      .filter(
        (m) => !api.has(m) && !fromActions.has(m) && !fromPages.has(m) && INTERNAL[m] === undefined,
      )
      .sort()

    expect(nowhere).toEqual([...NO_SURFACE].sort())
  })

  it('keeps both exception lists argued — every entry names a live capability and a reason', () => {
    for (const [name, list] of [
      ['WEB_ONLY', WEB_ONLY],
      ['INTERNAL', INTERNAL],
    ] as const) {
      for (const [method, reason] of Object.entries(list)) {
        expect(
          services.has(method),
          `${name}.${method} is exempted but is not a registered method`,
        ).toBe(true)
        expect(reason.length, `${name}.${method} needs a reason`).toBeGreaterThan(20)
      }
    }

    // The three lists answer three different questions and must stay disjoint — the same
    // discipline `19`'s retention rules use for LEGAL_HOLD_TABLES and SWEEP_RULES.
    const everywhere = [...Object.keys(WEB_ONLY), ...Object.keys(INTERNAL), ...NO_SURFACE]
    expect(new Set(everywhere).size, 'a capability appears on more than one list').toBe(
      everywhere.length,
    )
  })
})
