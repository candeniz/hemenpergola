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
 * Resolve the actor for this request.
 *
 * **Phase 0 returns an anonymous context.** Authentication is Phase 1
 * (`12-authentication-authorization.md`), and this function is where it lands — steps 1–3
 * of §Context resolution slot in below, in order:
 *
 *   1. identify the user (cookie session, or Bearer JWT on `/api/v1`)
 *   2. if the route carries `[companyId]`, load the `CompanyMembership` for (user, company);
 *      missing → `FORBIDDEN`, not `NOT_FOUND`, and never a redirect
 *   3. load `Company.status`, because capability is role ∩ status
 *
 * Two things are already correct and Phase 1 must not reshape them:
 *
 * **The signature.** `(request, params)` — everything comes from the request and the route,
 * nothing from module state.
 *
 * **`companyId` comes from `params`, never from the session.** A "current company" stored
 * in the session means a user with two companies open in two tabs has one tab silently
 * rewrite the other's scope, and revoking a membership would not take effect until the
 * token expired (`12` §Context resolution). Resolving per request from the path is what
 * makes revocation immediate.
 */
export async function resolveActor(
  request: ActorRequestLike,
  params: ActorRouteParams = {},
): Promise<ActorContext> {
  return {
    userId: null,
    globalRole: null,
    // Read from the route even while anonymous: the scope of the request is a property of
    // the URL, and Phase 1 only adds the membership lookup that turns it into a role.
    companyId: params.companyId ?? null,
    companyRole: null,
    companyStatus: null,
    locale: readLocale(params),
    ip: readIp(request),
    userAgent: readUserAgent(request),
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
