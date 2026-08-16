import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

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
  })

  it('makes every catalogue and settings method admin-only', async () => {
    /*
     * `17-admin-system.md`: `/yonetim/*` is `globalRole = ADMIN` only. The catalogue is the
     * public face of the platform and the settings move money, so neither is a place for a
     * company-scoped permission — an OWNER of a verified manufacturer must not be able to
     * edit what the platform sells or how wide its price bands are.
     */
    await importEveryService(modulesRoot)

    const offenders = registeredMethods()
      .filter((meta) => meta.service === 'catalog' || meta.service === 'platform')
      .filter((meta) => meta.authorisation.kind !== 'admin')
      .map((meta) => `${meta.service}.${meta.method} is ${meta.authorisation.kind}`)

    expect(offenders).toEqual([])
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
    // 18 from Phase 1, 15 catalogue and 2 settings from Phase 2.
    expect(registered.size).toBeGreaterThanOrEqual(35)
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
