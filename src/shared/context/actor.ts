import type { CompanyRole, CompanyStatus } from '@prisma/client'

import type { Locale } from '@/i18n/routing'

/**
 * `05-system-architecture.md` §ActorContext, verbatim.
 *
 * Built once per request. **Services never read cookies, headers or `auth()` themselves** —
 * that is what makes them callable from a job, from a route handler, from a server action
 * and from a test with the same signature.
 */
export type ActorContext = {
  userId: string | null
  globalRole: 'CUSTOMER' | 'ADMIN' | null
  /** Resolved from the route, never from session state. See §Context resolution below. */
  companyId: string | null
  companyRole: CompanyRole | null
  companyStatus: CompanyStatus | null
  locale: Locale
  ip: string
  userAgent: string
}

/** What `resolveActor` needs from the request. Framework-agnostic on purpose. */
export type ActorRequestLike = {
  headers: { get(name: string): string | null }
}

/** The route's dynamic segments. `companyId` arrives here or not at all. */
export type ActorRouteParams = {
  locale?: string
  companyId?: string
}

/**
 * How the user was identified. Injected rather than imported so `resolveActor` stays
 * testable and so the two surfaces — cookie session and Bearer JWT — plug into one
 * resolver (`12` §Two surfaces, one identity).
 */
export type IdentifiedUser = {
  userId: string
  globalRole: 'CUSTOMER' | 'ADMIN'
}

export type ActorDependencies = {
  /** Step 1: cookie session (web) or Bearer JWT (`/api/v1`). */
  identify: (request: ActorRequestLike) => Promise<IdentifiedUser | null>
  /** Step 2–3: the membership and the company's status, in one lookup. */
  loadMembership: (
    userId: string,
    companyId: string,
  ) => Promise<{ role: CompanyRole; status: CompanyStatus } | null>
}

const DEFAULT_LOCALE: Locale = 'tr'

function readLocale(params: ActorRouteParams): Locale {
  return params.locale === 'en' ? 'en' : DEFAULT_LOCALE
}

/**
 * Client IP. Behind a load balancer the socket address is the balancer, so the forwarded
 * header is the real source — first entry, since proxies append.
 *
 * This value is written into `Consent`, `AuditLog` and `PriceCalculation`
 * (`19-security-and-kvkk.md` §Audit, `ADR-006`), so "unknown" is recorded honestly rather
 * than guessed.
 */
function readIp(request: ActorRequestLike): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded !== null && forwarded.length > 0) {
    const first = forwarded.split(',')[0]?.trim()
    if (first !== undefined && first.length > 0) return first
  }
  return request.headers.get('x-real-ip') ?? 'unknown'
}

function readUserAgent(request: ActorRequestLike): string {
  return request.headers.get('user-agent') ?? 'unknown'
}

/**
 * Resolve the actor for this request — `12-authentication-authorization.md`
 * §Context resolution, all four steps.
 *
 *   1. identify the user (cookie session or Bearer JWT); no user → anonymous context
 *   2. if the route carries `[companyId]`, load the `CompanyMembership` for (user, company)
 *   3. load `Company.status` — capability is role ∩ status
 *   4. attach `locale`, `ip`, `userAgent` for audit and consent records
 *
 * **`companyId` comes from `params`, never from the session.** A "current company" stored
 * in the session means a user with two companies open in two tabs has one tab silently
 * rewrite the other's scope, and revoking a membership would not take effect until the
 * token expired. Resolving per request from the path is what makes revocation immediate.
 * `actor.test.ts` holds the two-tab case.
 *
 * Note what this function does **not** do: it does not reject. A user with no membership
 * for the requested company gets `companyRole: null`, and `authorize()` turns that into
 * `FORBIDDEN` — one place decides, and it is the same place for every surface
 * (`02` §Enforcement rule).
 */
export async function resolveActor(
  request: ActorRequestLike,
  params: ActorRouteParams = {},
  dependencies?: Partial<ActorDependencies>,
): Promise<ActorContext> {
  const identify = dependencies?.identify ?? defaultDependencies().identify
  const loadMembership = dependencies?.loadMembership ?? defaultDependencies().loadMembership

  const base: ActorContext = {
    userId: null,
    globalRole: null,
    companyId: params.companyId ?? null,
    companyRole: null,
    companyStatus: null,
    locale: readLocale(params),
    ip: readIp(request),
    userAgent: readUserAgent(request),
  }

  const identified = await identify(request)
  if (identified === null) return base

  const withUser: ActorContext = {
    ...base,
    userId: identified.userId,
    globalRole: identified.globalRole,
  }

  if (withUser.companyId === null) return withUser

  const membership = await loadMembership(identified.userId, withUser.companyId)
  if (membership === null) return withUser

  return { ...withUser, companyRole: membership.role, companyStatus: membership.status }
}

/**
 * The real dependencies, imported lazily so that importing this module from a test — or
 * from anywhere that has no database — does not drag in Prisma.
 */
function defaultDependencies(): ActorDependencies {
  return {
    async identify(request) {
      const { identifyFromRequest } = await import('@/modules/iam/infrastructure/identify')
      return identifyFromRequest(request)
    },
    async loadMembership(userId, companyId) {
      const { loadMembership } = await import('@/modules/iam/infrastructure/identify')
      return loadMembership(userId, companyId)
    },
  }
}

/** An explicit anonymous context, for jobs and tests that have no request at all. */
export function anonymousActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: null,
    globalRole: null,
    companyId: null,
    companyRole: null,
    companyStatus: null,
    locale: DEFAULT_LOCALE,
    ip: 'unknown',
    userAgent: 'unknown',
    ...overrides,
  }
}

export function isAuthenticated(actor: ActorContext): boolean {
  return actor.userId !== null
}
