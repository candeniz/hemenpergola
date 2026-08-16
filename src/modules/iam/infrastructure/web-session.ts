import 'server-only'

import { randomBytes } from 'node:crypto'

import { prisma } from '@/shared/db'

/**
 * Web sessions — `12-authentication-authorization.md` §Sessions and revocation, `ADR-022`.
 *
 * A **server-side row plus an opaque httpOnly cookie carrying only its id.** Not a JWT.
 *
 * `ADR-003` originally named Auth.js cookies for web, and `ADR-022` withdrew that half: the
 * Credentials provider supports only the JWT session strategy, and a stateless token cannot
 * do any of the four things `12` requires — list sessions with device and IP, revoke one,
 * revoke the rest on a password change, or make a membership change effective on the next
 * request. `ADR-003` promised the last of those itself.
 *
 * `Session(id, sessionToken, userId, expires)` has been in migration 1 since Phase 0, unused
 * until now. `identify.ts` has always read it; nothing ever wrote it, which is the bug Phase 4
 * found and Q23 records.
 */

/**
 * Thirty days, matching the refresh-token lifetime the API side already uses. A shorter web
 * session than API session would sign people out of the browser while their phone stayed in.
 */
const SESSION_DAYS = 30

/**
 * Not an Auth.js name. The cookie no longer pretends to be one, because reading
 * `authjs.session-token` and finding an opaque id would send the next person to Auth.js's
 * documentation to explain a value it did not produce.
 *
 * `__Host-` in production: it forbids a `Domain` attribute and requires `Secure` and
 * `Path=/`, so a subdomain cannot set or overwrite it. Development is plain HTTP, where the
 * prefix would make the cookie unsettable.
 */
export const SESSION_COOKIE = '__Host-pergola.session'
export const SESSION_COOKIE_DEV = 'pergola.session'

export function sessionCookieName(secure: boolean): string {
  return secure ? SESSION_COOKIE : SESSION_COOKIE_DEV
}

export type SessionCookieOptions = {
  httpOnly: true
  sameSite: 'lax'
  secure: boolean
  path: '/'
  expires: Date
}

/**
 * `SameSite=Lax` rather than `Strict`: the email-verification and password-reset links are
 * top-level navigations from a mail client, and `Strict` would drop the session on arrival,
 * signing the user out at the exact moment they followed our own link.
 */
export function sessionCookieOptions(expires: Date, secure: boolean): SessionCookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, path: '/', expires }
}

export type StartedSession = {
  token: string
  expires: Date
}

/**
 * Open a session for a user.
 *
 * The token is 32 random bytes, base64url. It is an **opaque identifier**, not a claim
 * carrier: nothing is derived from it, so nothing can be forged into it, and revoking it is a
 * `DELETE`.
 */
export async function startWebSession(userId: string): Promise<StartedSession> {
  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

  await prisma.session.create({ data: { sessionToken: token, userId, expires } })

  return { token, expires }
}

/** Close one session. Idempotent: signing out twice is not an error. */
export async function endWebSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { sessionToken: token } })
}

/**
 * Close every session for a user, optionally sparing the current one.
 *
 * `12` §Sessions and revocation, and the reason `resetPassword` calls it: the likeliest reason
 * somebody resets a password is that they believe someone else has it, and a reset that
 * leaves the intruder signed in has fixed nothing.
 */
export async function endAllWebSessions(userId: string, exceptToken?: string): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      userId,
      ...(exceptToken === undefined ? {} : { sessionToken: { not: exceptToken } }),
    },
  })

  return result.count
}
