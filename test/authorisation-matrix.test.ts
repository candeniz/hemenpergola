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
 * Files in `application/` that are not use cases: DTO schemas, the authorisation helper
 * itself, and the server-action adapter, which re-exports registered methods rather than
 * defining new ones.
 */
const NOT_USE_CASES = ['dto.ts', 'authorization.ts', 'actions.ts']

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

describe('every service method has a matrix entry', () => {
  const modulesRoot = fileURLToPath(new URL('../src/modules', import.meta.url))

  it('registers at least the Phase 1 methods', async () => {
    // Importing the service is what runs its `serviceMethod` calls.
    await import('@/modules/iam/application/auth-service')

    const methods = registeredMethods().map((meta) => `${meta.service}.${meta.method}`)
    expect(methods).toContain('auth.login')
    expect(methods).toContain('auth.register')
    expect(methods).toContain('auth.refresh')
    expect(methods).toContain('auth.logout')
  })

  it('declares an authorisation spec for every registered method', async () => {
    await import('@/modules/iam/application/auth-service')

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
    await import('@/modules/iam/application/auth-service')

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
