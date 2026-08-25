import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

import { authorize } from '@/modules/iam/application/authorization'
import {
  ALL_PERMISSIONS,
  COMPANY_ROLES,
  COMPANY_STATUSES,
  companyMemberCan,
  roleHasPermission,
  type CompanyRole,
  type Permission,
} from '@/modules/iam/domain/permissions'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'
import { registeredMethods } from '@/shared/service/registry'

/**
 * The authorisation matrix — `20-testing-strategy.md` §Integration, task 1.8.
 *
 * Two things live here and they are different:
 *
 *   **The grid.** Every permission × every one of the eight actors `20` names, with the
 *   expected allow/deny generated from the permission catalogue rather than typed out. A
 *   hand-written expectation table would be a second source of truth, and the first thing
 *   it would do is disagree with the first.
 *
 *   **The coverage scan.** Every exported service method must be registered. *"A new method
 *   with no matrix entry fails the build."* This is a unit test, not an integration one, so
 *   it runs in `pnpm test` and gates every commit — the check is pure static analysis and
 *   does not need a database to be true.
 */

// The eight actors from `20` §Integration, verbatim.
const COMPANY_ID = 'cmp_subject'

function member(role: CompanyRole): ActorContext {
  return anonymousActor({
    userId: `usr_${role.toLowerCase()}`,
    globalRole: 'CUSTOMER',
    companyId: COMPANY_ID,
    companyRole: role,
    companyStatus: 'VERIFIED',
  })
}

const ACTORS = {
  OWNER: member('OWNER'),
  ADMIN: member('ADMIN'),
  SALES: member('SALES'),
  VIEWER: member('VIEWER'),
  /** A member of a *different* company, addressing this one. */
  'other-company': anonymousActor({
    userId: 'usr_other',
    globalRole: 'CUSTOMER',
    companyId: COMPANY_ID,
    // resolveActor found no membership for (user, company), so role and status stay null.
    companyRole: null,
    companyStatus: null,
  }),
  /** A signed-in customer with no company at all. */
  customer: anonymousActor({ userId: 'usr_customer', globalRole: 'CUSTOMER' }),
  anonymous: anonymousActor(),
  /** Global admin — bypasses company scoping (02 §Admin). */
  admin: anonymousActor({ userId: 'usr_admin', globalRole: 'ADMIN' }),
} satisfies Record<string, ActorContext>

type ActorName = keyof typeof ACTORS

/** The expectation, derived from the catalogue — never typed out by hand. */
function expectedAllow(actorName: ActorName, permission: Permission): boolean {
  if (actorName === 'admin') return true
  if (actorName === 'anonymous' || actorName === 'customer' || actorName === 'other-company') {
    return false
  }
  return roleHasPermission(actorName, permission)
}

describe('authorisation matrix · every permission × every actor', () => {
  const cases = ALL_PERMISSIONS.flatMap((permission) =>
    (Object.keys(ACTORS) as ActorName[]).map((actorName) => ({
      permission,
      actorName,
      expected: expectedAllow(actorName, permission),
    })),
  )

  it(`covers ${ALL_PERMISSIONS.length} permissions × ${Object.keys(ACTORS).length} actors`, () => {
    expect(cases).toHaveLength(ALL_PERMISSIONS.length * Object.keys(ACTORS).length)
  })

  it.each(cases)('$actorName → $permission is $expected', ({ permission, actorName, expected }) => {
    const result = authorize(ACTORS[actorName], permission)

    expect(result.ok, `${actorName} on ${permission}`).toBe(expected)

    if (!result.ok) {
      // A denial is FORBIDDEN. `PRECONDITION` is reserved for "the role has it but the
      // company's status does not", which the status grid below covers.
      expect(result.error.kind).toBe('FORBIDDEN')
    }
  })
})

describe('capability is role ∩ status', () => {
  const grid = COMPANY_ROLES.flatMap((role) =>
    COMPANY_STATUSES.flatMap((status) =>
      ALL_PERMISSIONS.map((permission) => ({ role, status, permission })),
    ),
  )

  it.each(grid)('$role in a $status company → $permission', ({ role, status, permission }) => {
    const actor = anonymousActor({
      userId: 'usr',
      globalRole: 'CUSTOMER',
      companyId: COMPANY_ID,
      companyRole: role,
      companyStatus: status,
    })

    const result = authorize(actor, permission)
    expect(result.ok).toBe(companyMemberCan(role, status, permission))

    if (!result.ok) {
      // The distinction that matters to the person who has to fix it: "you are not allowed"
      // versus "your company is suspended". The second is actionable.
      const expectedKind = roleHasPermission(role, permission) ? 'PRECONDITION' : 'FORBIDDEN'
      expect(result.error.kind).toBe(expectedKind)
    }
  })

  it('lets a PENDING company do the work that gets it verified, and nothing else', () => {
    const owner = anonymousActor({
      userId: 'usr',
      globalRole: 'CUSTOMER',
      companyId: COMPANY_ID,
      companyRole: 'OWNER',
      companyStatus: 'PENDING',
    })

    expect(authorize(owner, 'company:company.update').ok).toBe(true)
    expect(authorize(owner, 'company:document.upload').ok).toBe(true)
    expect(authorize(owner, 'company:offer_request.read').ok).toBe(true)
    // Not operational yet.
    expect(authorize(owner, 'company:price_book.publish').ok).toBe(false)
    expect(authorize(owner, 'company:offer.send').ok).toBe(false)
  })

  it('freezes a SUSPENDED company to reads', () => {
    const owner = anonymousActor({
      userId: 'usr',
      globalRole: 'CUSTOMER',
      companyId: COMPANY_ID,
      companyRole: 'OWNER',
      companyStatus: 'SUSPENDED',
    })

    expect(authorize(owner, 'company:offer_request.read').ok).toBe(true)
    expect(authorize(owner, 'company:analytics.read').ok).toBe(true)
    expect(authorize(owner, 'company:offer.send').ok).toBe(false)
    expect(authorize(owner, 'company:company.update').ok).toBe(false)
  })
})

/**
 * The coverage scan — the half that makes the registry unavoidable.
 *
 * `serviceMethod()` cannot be called without declaring an authorisation spec, so anything
 * registered is covered by construction. What the type cannot stop is a developer exporting
 * a plain `async function` from an `application/` file. This finds those.
 */
const APPLICATION_DIR_PATTERN = /modules[\\/][^\\/]+[\\/]application[\\/][^\\/]+\.ts$/

function applicationFiles(root: string): string[] {
  const found: string[] = []

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      // A test file beside a service is not a service. Importing one would run its `describe`
      // inside this test, which vitest refuses — and rightly, since a suite that spawns
      // suites has no stable report.
      else if (entry.name.endsWith('.test.ts')) continue
      else if (APPLICATION_DIR_PATTERN.test(path)) found.push(path)
    }
  }

  walk(root)
  return found
}

/**
 * Files in `application/` that are not use cases: DTO schemas and the authorisation helper.
 *
 * `actions.ts` used to be here. It is gone because the server actions are no longer in
 * `application/` at all — they live in `app/actions/`, which is where `05` §Two entry points
 * draws them and the only place a `'use server'` file belongs. An exemption that no longer
 * exempts anything is a rule with a hole cut in it for a shape nobody remembers.
 */
const NOT_USE_CASES = ['dto.ts', 'authorization.ts']

/**
 * The exemption list, and it has exactly one entry.
 *
 * `/api/health` is an operational probe, not a use case: a load balancer has no
 * credentials, the endpoint takes no actor, and it returns no user data — three connection
 * booleans and a migration name (`23-deployment-and-environments.md` §Pipeline). Forcing it
 * through `serviceMethod` would mean inventing an actor for a caller that has none.
 *
 * A test below asserts this list is *exactly* these files, so adding a second exemption is
 * a deliberate edit somebody has to justify rather than a quiet append.
 */
const OPERATIONAL_PROBES = ['health-service.ts']

/** Exported `async function` / `export const x = async` — the shapes a service method takes. */
function exportedFunctionNames(source: string): string[] {
  const names = new Set<string>()

  for (const match of source.matchAll(/export\s+async\s+function\s+([A-Za-z0-9_]+)/g)) {
    if (match[1] !== undefined) names.add(match[1])
  }
  for (const match of source.matchAll(/export\s+const\s+([A-Za-z0-9_]+)\s*=\s*async\s*\(/g)) {
    if (match[1] !== undefined) names.add(match[1])
  }

  return [...names]
}

export function unregisteredServiceMethods(root: string): { file: string; name: string }[] {
  const registered = new Set(registeredMethods().map((meta) => meta.method))
  const offenders: { file: string; name: string }[] = []

  for (const file of applicationFiles(root)) {
    if (NOT_USE_CASES.some((name) => file.endsWith(name))) continue
    if (OPERATIONAL_PROBES.some((name) => file.endsWith(name))) continue

    const source = readFileSync(file, 'utf8')
    for (const name of exportedFunctionNames(source)) {
      if (!registered.has(name)) {
        offenders.push({ file: file.replaceAll('\\', '/'), name })
      }
    }
  }

  return offenders
}

/**
 * `export const name = serviceMethod...` — the declarations the registry should end up
 * holding. Read from the source rather than from the module, so a method that is never
 * imported anywhere still has to appear.
 */
function declaredServiceMethods(source: string): string[] {
  return [...source.matchAll(/export\s+const\s+([A-Za-z0-9_]+)\s*=\s*serviceMethod/g)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined)
}

/**
 * Import every `application/` module, because importing is what runs its `serviceMethod()`
 * calls and therefore what populates the registry.
 *
 * Discovered from disk rather than listed. A hand-written list would mean a new module is
 * covered only once somebody remembers to add it here — which is exactly the failure the
 * registry exists to make impossible, reintroduced in the test that proves it.
 */
async function importEveryService(root: string): Promise<void> {
  for (const file of applicationFiles(root)) {
    if (NOT_USE_CASES.some((name) => file.endsWith(name))) continue
    if (OPERATIONAL_PROBES.some((name) => file.endsWith(name))) continue

    const specifier = file
      .replaceAll('\\', '/')
      .replace(/^.*\/src\//, '@/')
      .replace(/\.ts$/, '')
    await import(specifier)
  }
}

describe('every service method has a matrix entry', () => {
  const modulesRoot = fileURLToPath(new URL('../src/modules', import.meta.url))

  // The first import of the full service graph transforms every module in it, which on a
  // cold vitest cache takes longer than the 5 s default *test* timeout. It happens once,
  // here, with a budget of its own; the per-test calls below are then cache hits. This also
  // removes an ordering dependency: two tests read `registeredMethods()` without importing,
  // which only worked while an earlier test in the same file had already done so.
  beforeAll(() => importEveryService(modulesRoot), 120_000)

  it('registers at least the Phase 1 methods', async () => {
    await importEveryService(modulesRoot)

    const methods = registeredMethods().map((meta) => `${meta.service}.${meta.method}`)

    // 1.1–1.3
    expect(methods).toContain('auth.login')
    expect(methods).toContain('auth.register')
    expect(methods).toContain('auth.refresh')
    expect(methods).toContain('auth.logout')
    // 1.4
    expect(methods).toContain('auth.requestPasswordReset')
    expect(methods).toContain('auth.resetPassword')
    expect(methods).toContain('auth.verifyEmail')
    expect(methods).toContain('auth.resendEmailVerification')
    // 1.5
    expect(methods).toContain('auth.startPhoneVerification')
    expect(methods).toContain('auth.confirmPhoneVerification')
    // 1.6
    expect(methods).toContain('company.createCompany')
    expect(methods).toContain('company.listMembers')
    expect(methods).toContain('company.inviteMember')
    expect(methods).toContain('company.acceptInvitation')
    expect(methods).toContain('company.changeMemberRole')
    expect(methods).toContain('company.removeMember')
    // 1.9
    expect(methods).toContain('auth.listSessions')
    expect(methods).toContain('auth.revokeSession')

    // 2.2 — catalogue CRUD. `CAT-03`: an admin adds a product with no deployment, which
    // means these are the methods standing between an admin and the public catalogue.
    for (const method of [
      'catalog.listCategories',
      'catalog.createCategory',
      'catalog.updateCategory',
      'catalog.deleteCategory',
      'catalog.listProducts',
      'catalog.getProduct',
      'catalog.createProduct',
      'catalog.updateProduct',
      'catalog.createAttribute',
      'catalog.updateAttribute',
      'catalog.deleteAttribute',
      'catalog.createOption',
      'catalog.updateOption',
      'catalog.deactivateOption',
      'catalog.deleteOption',
    ]) {
      expect(methods, method).toContain(method)
    }

    // 2.7
    expect(methods).toContain('platform.listSettings')
    expect(methods).toContain('platform.updateSetting')

    // 2.4 — verification. These are the methods that decide whether a company can be
    // matched at all, which is the most consequential admin action in the product.
    for (const method of [
      'company.listVerificationQueue',
      'company.getCompanyForVerification',
      'company.verifyCompany',
      'company.rejectCompany',
      'company.requestDocuments',
      'company.suspendCompany',
      'company.reviewDocument',
    ]) {
      expect(methods, method).toContain(method)
    }

    // 2.5
    expect(methods).toContain('audit.listAuditEntries')
    expect(methods).toContain('audit.listAuditFacets')

    // Phase 3 · the supply side
    for (const method of [
      // 3.1
      'company.getCompanyProfile',
      'company.updateCompanyProfile',
      'company.updateCompanySlug',
      'company.updateCompanyContact',
      'company.attachDocument',
      // 3.2
      'catalog.listCompanyProducts',
      'catalog.setCompanyProduct',
      'catalog.setCompanyOptions',
      // 3.6
      'matching.listServiceAreas',
      'matching.addServiceArea',
      'matching.removeServiceArea',
      'matching.listCompaniesCoveringPoint',
      'matching.listCities',
      'matching.listDistricts',
      // Phase 4 · the configurator
      'catalog.listConfigurableProducts',
      'catalog.getConfigurableProduct',
      'platform.dashboardCounts',
      'project.createProject',
      'project.getProject',
      'project.patchStep',
      'project.validateProject',
      // 3.7
      'portfolio.listPortfolio',
      'portfolio.createPortfolioItem',
      'portfolio.updatePortfolioItem',
      'portfolio.deletePortfolioItem',
      'portfolio.attachPhoto',
      // 3.3 · price book lifecycle
      'pricing.listPriceBooks',
      'pricing.getPriceBook',
      'pricing.createDraft',
      'pricing.savePriceBook',
      'pricing.publishPriceBook',
      // 3.5 · the simulator, and the published path Phase 5 will call
      'pricing.simulatePriceBook',
      'pricing.estimateForProject',
      // the company switcher
      'company.listMyCompanies',
      // uploads
      'media.presignUpload',
      'media.completeUpload',
      'media.fileUrl',
    ]) {
      expect(methods, method).toContain(method)
    }
  })

  it('scopes every project method by ownership, carrying both identities', () => {
    /*
     * `02` §Customer permissions: *"A customer needs no permission catalogue: authorisation
     * is ownership plus state."* So there is deliberately **no** `PROJECT_*` permission, and
     * a project method declaring `kind: 'permission'` would mean somebody invented one.
     *
     * `scopedBy` must name **both** identities. `04` §Project sets exactly one of
     * `customerId` / `anonymousKey`, and 4.5 makes the anonymous half real — a method scoped
     * only by `userId` would have to be found and widened then, and the matrix is the most
     * copied mechanism in this project.
     *
     * The claim this shape makes is also different from the company-scoped one: reaching
     * another customer's project answers `NOT_FOUND`, not `FORBIDDEN`, because ownership is
     * in the `where` clause and the row never comes back. The integration suite proves the
     * behaviour; this asserts the declaration.
     */
    const projectMethods = registeredMethods().filter((meta) => meta.service === 'project')

    expect(projectMethods.length).toBeGreaterThanOrEqual(4)

    for (const meta of projectMethods) {
      expect(meta.authorisation.kind).toBe('customer-owned')

      const spec = meta.authorisation as { kind: 'customer-owned'; scopedBy: readonly string[] }
      expect([...spec.scopedBy].sort()).toEqual(['anonymousKey', 'userId'])
    }
  })

  it('keeps matching’s anonymous surface to the two reference-data reads', () => {
    /*
     * `listCities` and `listDistricts` went `anonymous` when Phase 5 found the public
     * wizard's location step reading them with no session (`ADR-021`) — 81 provinces and
     * 974 districts are public reference data. Same discipline as `catalog`'s
     * `PUBLIC_READ`: the set is named and counted, so the next anonymous matching method is
     * a deliberate edit here rather than a quiet widening, and a name that is not a
     * `get*`/`list*` read cannot slip in at all.
     */
    /*
     * `listCompaniesCoveringPoint` has been anonymous since Phase 3 (it fed the phase
     * gate's boundary probe, and which verified companies serve a point is public
     * directory data); pinning this list is what surfaced it, and the pin renamed it from
     * `companiesCoveringPoint` so the read-shape rule below holds with no exception.
     */
    const MATCHING_PUBLIC_READ = ['listCities', 'listDistricts', 'listCompaniesCoveringPoint']

    const anonymous = registeredMethods().filter(
      (meta) => meta.service === 'matching' && meta.authorisation.kind === 'anonymous',
    )

    expect(anonymous.map((meta) => meta.method).sort()).toEqual([...MATCHING_PUBLIC_READ].sort())

    for (const meta of anonymous) {
      expect(meta.method, `${meta.method} is anonymous but not shaped like a read`).toMatch(
        /^(get|list)/,
      )
    }
  })

  it('keeps the public directory anonymous surface to the eight pinned reads', () => {
    /*
     * Task 8.1's directory module is anonymous BY DESIGN — its whole job is public
     * canonical URLs — which is exactly why it gets the same pin as `MATCHING_PUBLIC_READ`
     * and `catalog`'s `PUBLIC_READ`: the set is named and counted, every member is shaped
     * like a read, and the sixth anonymous method is a reviewed diff. The DTOs it returns
     * are the KVKK boundary here too: a public review carries text and score, never the
     * author; the manufacturer card carries `avgRating: null` below three published
     * reviews (`16` §Aggregates).
     */
    const DIRECTORY_PUBLIC_READ = [
      'listPublicCategories',
      'getPublicCategory',
      'getPublicProduct',
      'listPublicManufacturers',
      'getPublicManufacturer',
      // The sitemap's slug feed — public by definition, and the reason app/sitemap.ts
      // needs no database client of its own (05 §Shape).
      'listPublicSlugs',
      // 8.2 — city landing pages, which exist ONLY where real supply exists; both reads
      // apply the same supply predicate, so an unsupplied city is a 404 everywhere.
      'listPublicCities',
      'getPublicCity',
    ]

    const anonymous = registeredMethods().filter((meta) => meta.service === 'directory')

    expect(anonymous.map((meta) => meta.method).sort()).toEqual([...DIRECTORY_PUBLIC_READ].sort())

    for (const meta of anonymous) {
      expect(meta.authorisation.kind).toBe('anonymous')
      expect(meta.method, `${meta.method} is anonymous but not shaped like a read`).toMatch(
        /^(get|list)/,
      )
    }
  })

  it('keeps the CMS split admin-writes / anonymous-read, pinned', () => {
    // Task 8.3: the admin writes structured blocks, the public reads them. Exactly two
    // methods; a third is a reviewed diff. The XSS control is upstream of authorisation —
    // the closed block union — but the split matters too: nothing anonymous may write.
    const content = registeredMethods().filter((meta) => meta.service === 'content')

    expect(content.map((meta) => `${meta.method}:${meta.authorisation.kind}`).sort()).toEqual([
      'getPublicContentPage:anonymous',
      'upsertContentPage:admin',
    ])
  })

  it('keeps the privacy service to its four pinned methods — two owned, two token-authorised', () => {
    /*
     * Task 9.1, reshaped by Q30 in Phase 10.3: the KVKK rights surface. The two *requests*
     * are customer-owned (userId in the where clause); the two *resolutions* are
     * `anonymous` because possession of the emailed 256-bit token IS the authorisation —
     * the verification-link trust model. The erasure pair replaced the single-step
     * `anonymiseAccount`, whose typed-email check was a speed bump and not a factor: over
     * HTTP, `GET /me` handed any bearer of the session the very address it asked for. A
     * fifth method here, or a third anonymous one, is a reviewed diff.
     */
    const privacy = registeredMethods().filter((meta) => meta.service === 'privacy')

    expect(privacy.map((meta) => `${meta.method}:${meta.authorisation.kind}`).sort()).toEqual(
      [
        'confirmAccountErasure:anonymous',
        'downloadDataExport:anonymous',
        'requestAccountErasure:customer-owned',
        'requestDataExport:customer-owned',
      ].sort(),
    )
  })

  it('keeps every pricing method company-scoped, never admin', () => {
    /*
     * A price book belongs to the manufacturer who wrote it. `ADR-006` lets an admin read a
     * breakdown and the market aggregate, but nothing in `pricing` may be *authored* by an
     * admin — an admin who can publish a price book can change what a customer is quoted on
     * behalf of a company that never agreed to it.
     *
     * Asserted as a whole-service rule rather than per method, so a method added later is
     * covered without anybody remembering to come back here.
     */
    const pricing = registeredMethods().filter((meta) => meta.service === 'pricing')

    expect(pricing.length).toBeGreaterThanOrEqual(7)
    expect(
      pricing
        .filter((meta) => meta.authorisation.kind !== 'permission')
        .map((meta) => `${meta.service}.${meta.method} is ${meta.authorisation.kind}`),
    ).toEqual([])
  })

  it('keeps the audit log read-only, including for admins', async () => {
    /*
     * `17` §Audit log: *"Read-only for everyone, including admins; append-only in the
     * database."* The registry is where that is checkable — a method named `updateAudit…`
     * or `deleteAudit…` would have to be registered to exist at all, and retention is a
     * Phase 9 job rather than an action anybody can take from a screen.
     */
    await importEveryService(modulesRoot)

    const writers = registeredMethods()
      .filter((meta) => meta.service === 'audit')
      .filter((meta) => /^(create|update|delete|remove|purge)/.test(meta.method))

    expect(writers.map((meta) => meta.method)).toEqual([])
  })

  it('makes the platform-owned surfaces admin-only, and the company-owned ones not', async () => {
    /*
     * `17-admin-system.md`: `/yonetim/*` is `globalRole = ADMIN` only. The platform
     * catalogue is the public face of the product and the settings move money, so neither is
     * a place for a company-scoped permission — an OWNER of a verified manufacturer must not
     * be able to edit what the platform sells or how wide its price bands are.
     *
     * **The mirror image matters just as much**, and Phase 3 is where it started to: the
     * `catalog` service now holds both the platform catalogue *and* the company's offer over
     * it. A blanket "everything in catalog is admin" was true in Phase 2 and would have made
     * `setCompanyProduct` admin-only — a manufacturer unable to say what they sell. The
     * split is named here rather than inferred from a service name.
     */
    await importEveryService(modulesRoot)

    const VERIFICATION = new Set([
      'listVerificationQueue',
      'getCompanyForVerification',
      'verifyCompany',
      'rejectCompany',
      'requestDocuments',
      'suspendCompany',
      'reviewDocument',
    ])

    /** The company's offer over the catalogue — theirs to edit, not the platform's. */
    const COMPANY_OWNED = new Set(['listCompanyProducts', 'setCompanyProduct', 'setCompanyOptions'])

    /**
     * Public reads of the catalogue. `ADR-021` put the configurator on a public path, so the
     * product list it renders is reachable without a session — the same rows the public
     * catalogue already shows.
     *
     * Named rather than pattern-matched: "anything called list* may be anonymous" would let
     * the next admin list slip out silently, which is the failure this whole test exists for.
     */
    const PUBLIC_READ = new Set(['listConfigurableProducts', 'getConfigurableProduct'])

    const platformOwned = registeredMethods().filter(
      (meta) =>
        (meta.service === 'catalog' &&
          !COMPANY_OWNED.has(meta.method) &&
          !PUBLIC_READ.has(meta.method)) ||
        meta.service === 'platform' ||
        meta.service === 'audit' ||
        (meta.service === 'company' && VERIFICATION.has(meta.method)),
    )

    expect(
      platformOwned
        .filter((meta) => meta.authorisation.kind !== 'admin')
        .map((meta) => `${meta.service}.${meta.method} is ${meta.authorisation.kind}`),
    ).toEqual([])

    /*
     * The public read must be anonymous *and* must stay a read. An anonymous method that
     * could write would be the worst outcome of this exception, so the name is asserted as
     * well as the kind.
     */
    const publicRead = registeredMethods().filter(
      (meta) => meta.service === 'catalog' && PUBLIC_READ.has(meta.method),
    )

    expect(publicRead).toHaveLength(2)
    expect(publicRead.every((meta) => meta.authorisation.kind === 'anonymous')).toBe(true)

    /*
     * Reads only. An anonymous method that could write would be the worst outcome of this
     * exception, so the *shape of the name* is asserted too — `get*` and `list*` and nothing
     * else. A `setConfigurableProduct` would fail here before anybody had to notice it.
     */
    expect(
      publicRead.filter((meta) => !/^(get|list)/.test(meta.method)).map((meta) => meta.method),
    ).toEqual([])

    // And the company-owned three are *not* admin, or a manufacturer cannot say what they
    // sell. Both directions, so neither list can quietly swallow the other.
    const companyOwned = registeredMethods().filter(
      (meta) => meta.service === 'catalog' && COMPANY_OWNED.has(meta.method),
    )

    expect(companyOwned).toHaveLength(3)
    expect(
      companyOwned
        .filter((meta) => meta.authorisation.kind !== 'permission')
        .map((meta) => `${meta.service}.${meta.method} is ${meta.authorisation.kind}`),
    ).toEqual([])
  })

  it('covers every declaration in every application module, discovered from disk', async () => {
    /*
     * The gate condition for Phase 1: *the matrix covers every service method that exists*.
     *
     * "Every method the test remembered to import" is a weaker claim and reads identically
     * in a green run, so the file list comes from the filesystem and the method list from
     * the source text. A new module with six methods and no import anywhere still fails here.
     */
    await importEveryService(modulesRoot)

    const registered = new Set(registeredMethods().map((meta) => meta.method))
    const missing: string[] = []

    for (const file of applicationFiles(modulesRoot)) {
      if (NOT_USE_CASES.some((name) => file.endsWith(name))) continue
      if (OPERATIONAL_PROBES.some((name) => file.endsWith(name))) continue

      for (const name of declaredServiceMethods(readFileSync(file, 'utf8'))) {
        if (!registered.has(name)) missing.push(`${file.replaceAll('\\', '/')} → ${name}`)
      }
    }

    expect(missing).toEqual([])

    // And the count is not zero, which is how this test would pass while measuring nothing.
    // 18 from Phase 1; 15 catalogue, 2 settings, 7 verification and 2 audit from Phase 2;
    // 5 profile, 3 offer, 4 service area, 5 portfolio and 3 media from Phase 3.
    expect(registered.size).toBeGreaterThanOrEqual(80)
  })

  it('declares an authorisation spec for every registered method', async () => {
    await importEveryService(modulesRoot)

    for (const meta of registeredMethods()) {
      expect(meta.authorisation, `${meta.service}.${meta.method}`).toBeDefined()

      // `anonymous` must carry a reason. A blank one would make "no authorisation" the
      // cheapest option available, which is the opposite of what this registry is for.
      if (meta.authorisation.kind === 'anonymous') {
        expect(meta.authorisation.why.length).toBeGreaterThan(10)
      }
      if (meta.authorisation.kind === 'owner') {
        expect(meta.authorisation.describe.length).toBeGreaterThan(3)
      }
    }
  })

  it('keeps the exemption list to the one operational probe', () => {
    // If this fails, someone exempted a second file. That may be right — but it is a
    // decision, and it should be argued for in the pull request rather than discovered.
    expect(OPERATIONAL_PROBES).toEqual(['health-service.ts'])
  })

  it('makes every member-scoped action file hand resolveActor a company', async () => {
    /*
     * The mechanism Phase 6's screen-found bug earned. The manufacturer actions called
     * member-permission services with an actor resolved WITHOUT the route's company, so
     * `resolveActor` loaded no membership and every click met "Not permitted" — found by a
     * browser, not by a test, because the pattern had been copied without the rule.
     *
     * The rule, statically: an `app/actions` file that names a member-permission service
     * method (a `company:*` permission an OWNER holds and a global admin does not bypass
     * exclusively — i.e. the manufacturer's own verbs) must call `resolveActor` with a
     * second argument, which is where the company goes. Admin action files (verification,
     * catalogue, settings) pass no company by design — the admin bypass needs none — so
     * the scan keys on the *member* methods, not on the permission kind alone.
     */
    await importEveryService(modulesRoot)

    // Member-scoped: permission-kind methods whose permission an OWNER holds. The admin
    // surfaces (platform catalogue, settings, verification, audit) are not OWNER-holdable,
    // so they fall out of this set without a hand-written list.
    const memberMethods = registeredMethods()
      .filter((meta) => meta.authorisation.kind === 'permission')
      .filter((meta) => {
        const spec = meta.authorisation as { kind: 'permission'; permission: Permission }
        return roleHasPermission('OWNER', spec.permission)
      })
      .map((meta) => meta.method)

    expect(memberMethods.length).toBeGreaterThan(10) // the scan is measuring something

    const actionsDir = fileURLToPath(new URL('../src/app/actions', import.meta.url))
    const offenders: string[] = []

    for (const entry of readdirSync(actionsDir, { withFileTypes: true })) {
      if (!entry.name.endsWith('.ts')) continue
      const source = readFileSync(join(actionsDir, entry.name), 'utf8')

      const callsMemberMethod = memberMethods.some((method) =>
        new RegExp(`\\bservice\\.${method}\\b|\\b${method}\\s*\\(`).test(source),
      )
      if (!callsMemberMethod) continue

      // "hands resolveActor a company": every resolveActor call site in the file passes a
      // second argument. One-argument calls are what produced the membershipless actor.
      const oneArgCalls = source.match(/resolveActor\(\s*\{[^)]*\}\s*\)/gs) ?? []
      const twoArgCalls = source.match(/resolveActor\(\s*\{[\s\S]*?\}\s*,/g) ?? []

      if (twoArgCalls.length === 0 || oneArgCalls.length > 0) {
        offenders.push(entry.name)
      }
    }

    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `These action files call member-scoped services but resolve an actor with no ` +
            `company argument — the exact shape of the Phase 6 bug:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })

  it('finds no exported service method outside the registry', async () => {
    await importEveryService(modulesRoot)

    const offenders = unregisteredServiceMethods(modulesRoot)

    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `Unregistered service methods:\n${offenders
            .map((o) => `  ${o.file} → ${o.name}`)
            .join('\n')}\nWrap each in serviceMethod() so it enters the authorisation matrix.`,
    ).toEqual([])
  })
})
