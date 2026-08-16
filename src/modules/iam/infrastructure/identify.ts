import 'server-only'

import type { CompanyRole, CompanyStatus } from '@prisma/client'

import type { ActorRequestLike, IdentifiedUser } from '@/shared/context/actor'
import { prisma } from '@/shared/db'

import { verifyAccessToken } from './token-service'

/**
 * Step 1 of `12-authentication-authorization.md` §Context resolution: identify the user.
 *
 * Two surfaces, one identity (`ADR-003`):
 *
 *   `/api/v1`  `Authorization: Bearer <JWT>` — and **cookies are not accepted here**. That
 *              is not a detail: with no ambient credential, a cross-site request carries
 *              nothing, so CSRF cannot exist on this surface at all.
 *   web        Auth.js v5 cookie session, checked only when there is no Bearer header.
 */
export async function identifyFromRequest(
  request: ActorRequestLike,
): Promise<IdentifiedUser | null> {
  const bearer = readBearerToken(request)

  if (bearer !== null) {
    const claims = await verifyAccessToken(bearer)
    if (claims === null) return null

    // The token proves who signed in; it does not prove they are still allowed to. A user
    // suspended five minutes ago must not keep a valid 15-minute token working.
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, globalRole: true, status: true },
    })

    if (user === null || user.status === 'SUSPENDED') return null

    // The role comes from the database, not from the claim: a role change takes effect on
    // the next request rather than at token expiry (`12` §Sessions and revocation).
    return { userId: user.id, globalRole: user.globalRole }
  }

  return identifyFromSession(request)
}

function readBearerToken(request: ActorRequestLike): string | null {
  const header = request.headers.get('authorization')
  if (header === null) return null

  const [scheme, value] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || value === undefined || value.length === 0) return null

  return value
}

/**
 * The web session — a server-side row addressed by an opaque cookie (`ADR-022`).
 *
 * The row is read directly rather than through any framework helper because `resolveActor`
 * runs in route handlers, server actions and jobs alike, and a request-context helper is
 * unavailable in a job. Same table, same cookie, one code path.
 *
 * Reading the row on every request is the cost that buys revocation: a suspended user, a
 * revoked session and a changed membership all take effect on the **next request** rather
 * than at token expiry.
 */
async function identifyFromSession(request: ActorRequestLike): Promise<IdentifiedUser | null> {
  const token = readSessionCookie(request)
  if (token === null) return null

  const session = await prisma.session.findUnique({
    where: { sessionToken: token },
    select: { expires: true, user: { select: { id: true, globalRole: true, status: true } } },
  })

  if (session === null) return null
  if (session.expires.getTime() <= Date.now()) return null
  if (session.user.status === 'SUSPENDED') return null

  return { userId: session.user.id, globalRole: session.user.globalRole }
}

/**
 * The web session cookie — `ADR-022`, `web-session.ts`.
 *
 * Both names are accepted because the `__Host-` prefix requires `Secure`, which development
 * over plain HTTP cannot set. The Auth.js names this list used to carry are gone: nothing
 * ever wrote them, and keeping them would point the next reader at documentation for a
 * mechanism this codebase does not use.
 */
const SESSION_COOKIE_NAMES = ['__Host-pergola.session', 'pergola.session'] as const

function readSessionCookie(request: ActorRequestLike): string | null {
  const header = request.headers.get('cookie')
  if (header === null) return null

  const jar = new Map(
    header.split(';').map((pair) => {
      const index = pair.indexOf('=')
      if (index === -1) return [pair.trim(), '']
      return [pair.slice(0, index).trim(), decodeURIComponent(pair.slice(index + 1).trim())]
    }),
  )

  for (const name of SESSION_COOKIE_NAMES) {
    const value = jar.get(name)
    if (value !== undefined && value.length > 0) return value
  }

  return null
}

/**
 * Steps 2 and 3: the membership and the company's status, in one query.
 *
 * Returns `null` when the user is not a member — `resolveActor` leaves `companyRole` null
 * and `authorize()` produces `FORBIDDEN`. Not `NOT_FOUND`: whether a company exists is not
 * something a non-member gets to learn from the error shape (`12` §Context resolution).
 */
export async function loadMembership(
  userId: string,
  companyId: string,
): Promise<{ role: CompanyRole; status: CompanyStatus } | null> {
  const membership = await prisma.companyMembership.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: { role: true, company: { select: { status: true, deletedAt: true } } },
  })

  if (membership === null) return null
  if (membership.company.deletedAt !== null) return null

  return { role: membership.role, status: membership.company.status }
}
