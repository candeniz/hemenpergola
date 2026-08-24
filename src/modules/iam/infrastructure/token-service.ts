import 'server-only'

import { createHash, randomBytes, randomUUID } from 'node:crypto'

import type { AuthTokenType } from '@prisma/client'
import { jwtVerify, SignJWT } from 'jose'

import { env } from '@/shared/config/env'
import { prisma } from '@/shared/db'

/**
 * Tokens — `12-authentication-authorization.md` §Tokens.
 *
 * | Token | Lifetime | Storage |
 * |---|---|---|
 * | Access JWT | 15 min | client memory |
 * | Refresh JWT | 30 days, single-use, rotating with reuse detection | client secure storage |
 * | Email verification | 24 h, single-use | DB, **hashed** |
 * | Password reset | 1 h, single-use | DB, **hashed** |
 * | Phone OTP | 5 min, 6 digits, 5 attempts | DB, **hashed** |
 *
 * Everything stored is hashed. A database dump must not be a set of working password-reset
 * links (`19-security-and-kvkk.md` §Logging).
 */

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

export const AUTH_TOKEN_TTL_SECONDS: Record<AuthTokenType, number> = {
  EMAIL_VERIFICATION: 24 * 60 * 60,
  PASSWORD_RESET: 60 * 60,
  PHONE_OTP: 5 * 60,
  // 19 §Access: the export download link lives 30 days (multi-use — verified, not consumed).
  DATA_EXPORT: 30 * 24 * 60 * 60,
}

export const OTP_MAX_ATTEMPTS = 5

const ISSUER = 'pergola'
const AUDIENCE = 'pergola:api/v1'

function secret(): Uint8Array {
  return new TextEncoder().encode(env.AUTH_SECRET)
}

/**
 * SHA-256, not Argon2. These are 256-bit random values, not user-chosen secrets: there is
 * nothing to brute-force, so a slow hash would only make verification slow.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

// ── Access token ─────────────────────────────────────────────────────────────

/**
 * Claims are minimal: `sub`, `role`, `iat`, `exp`, `jti`.
 *
 * **No `companyId`.** Company scope is resolved per request from the path
 * (`12` §Context resolution), so revoking a membership takes effect on the next request
 * rather than when the token happens to expire. `token-service.test.ts` asserts the claim
 * set exactly, because this is the kind of field that gets added "just for convenience".
 */
export type AccessTokenClaims = {
  sub: string
  role: 'CUSTOMER' | 'ADMIN'
  jti: string
  iat: number
  exp: number
}

export async function issueAccessToken(
  userId: string,
  role: 'CUSTOMER' | 'ADMIN',
): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret())
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, audience: AUDIENCE })

    if (typeof payload.sub !== 'string') return null
    if (payload.role !== 'CUSTOMER' && payload.role !== 'ADMIN') return null
    if (typeof payload.jti !== 'string') return null
    if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') return null

    return {
      sub: payload.sub,
      role: payload.role,
      jti: payload.jti,
      iat: payload.iat,
      exp: payload.exp,
    }
  } catch {
    // Expired, wrong signature, wrong issuer — all the same answer to the caller.
    return null
  }
}

// ── Refresh token ────────────────────────────────────────────────────────────

export type IssuedRefresh = { token: string; familyId: string; expiresAt: Date }

export type RefreshContext = { ip?: string; userAgent?: string }

/** Starts a new family. One family is one login. */
export async function issueRefreshToken(
  userId: string,
  context: RefreshContext = {},
): Promise<IssuedRefresh> {
  return createRefreshToken(userId, randomUUID(), context)
}

async function createRefreshToken(
  userId: string,
  familyId: string,
  context: RefreshContext,
): Promise<IssuedRefresh> {
  const token = randomToken()
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000)

  await prisma.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    },
  })

  return { token, familyId, expiresAt }
}

export type RefreshOutcome =
  | { status: 'rotated'; userId: string; refresh: IssuedRefresh }
  | { status: 'unknown' }
  | { status: 'expired' }
  | { status: 'revoked' }
  /** The family has been destroyed because this token had already been used. */
  | { status: 'reuse_detected'; userId: string; familyId: string }

/**
 * Rotate a refresh token.
 *
 * The interesting branch is `reuse_detected`. A refresh token is single-use, so the only
 * way a *used* one arrives again is that somebody else has a copy — the legitimate client
 * has already moved on to its successor. There is no way to tell which of the two callers
 * is the thief, so the whole family dies and both are forced to log in again
 * (`12` §Tokens). Losing one session is the cheap outcome; leaving a stolen token valid for
 * thirty days is not.
 */
export async function rotateRefreshToken(
  token: string,
  context: RefreshContext = {},
): Promise<RefreshOutcome> {
  const tokenHash = hashToken(token)
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } })

  if (existing === null) return { status: 'unknown' }

  if (existing.usedAt !== null) {
    await revokeFamily(existing.familyId, 'reuse_detected')
    return { status: 'reuse_detected', userId: existing.userId, familyId: existing.familyId }
  }

  if (existing.revokedAt !== null) return { status: 'revoked' }
  if (existing.expiresAt.getTime() <= Date.now()) return { status: 'expired' }

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { usedAt: new Date() },
  })

  const refresh = await createRefreshToken(existing.userId, existing.familyId, context)
  return { status: 'rotated', userId: existing.userId, refresh }
}

/** Kill one family — logout, reuse detection, or a password change. */
export async function revokeFamily(familyId: string, reason: string): Promise<number> {
  const result = await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  })
  return result.count
}

/**
 * Kill every family for a user — password change or reset (`12` §Sessions and revocation).
 *
 * `exceptFamilyId` spares the caller's own session, which is what "sign out everywhere
 * else" means. A password *reset* passes nothing, because the person resetting is not
 * signed in and the whole point is that whoever else was, no longer is.
 */
export async function revokeAllFamilies(
  userId: string,
  reason: string,
  exceptFamilyId?: string,
): Promise<number> {
  const result = await prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptFamilyId === undefined ? {} : { familyId: { not: exceptFamilyId } }),
    },
    data: { revokedAt: new Date(), revokedReason: reason },
  })
  return result.count
}

export type SessionSummary = {
  familyId: string
  ip: string | null
  userAgent: string | null
  startedAt: Date
  lastUsedAt: Date
  current: boolean
}

/**
 * The signed-in sessions of one user, one row per family (`12` §Sessions and revocation).
 *
 * A family is a login, so the *first* token in it is when the session started and the
 * newest is when it was last used — which is the pair the screen shows next to the device.
 */
export async function listSessionFamilies(
  userId: string,
  currentToken?: string,
): Promise<SessionSummary[]> {
  const tokens = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'asc' },
  })

  const currentHash = currentToken === undefined ? null : hashToken(currentToken)
  const families = new Map<string, SessionSummary>()

  for (const token of tokens) {
    const existing = families.get(token.familyId)
    const current = currentHash !== null && token.tokenHash === currentHash

    if (existing === undefined) {
      families.set(token.familyId, {
        familyId: token.familyId,
        ip: token.ip,
        userAgent: token.userAgent,
        startedAt: token.createdAt,
        lastUsedAt: token.createdAt,
        current,
      })
      continue
    }

    existing.lastUsedAt = token.createdAt
    if (current) existing.current = true
    // Keep the newest device fingerprint: rotation records where the session is *now*.
    if (token.ip !== null) existing.ip = token.ip
    if (token.userAgent !== null) existing.userAgent = token.userAgent
  }

  return [...families.values()].sort((a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime())
}

/** The family a refresh token belongs to, for "this is the session I am in". */
export async function familyOfToken(token: string): Promise<string | null> {
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { familyId: true, userId: true },
  })
  return row?.familyId ?? null
}

// ── Verification tokens ──────────────────────────────────────────────────────

export type IssuedAuthToken = { token: string; expiresAt: Date }

/**
 * Issue an email-verification, password-reset or phone-OTP token. The plaintext is returned
 * once, to be sent; only the hash is stored.
 *
 * Issuing a new token of a type invalidates the outstanding ones of that type, so a user
 * who clicks "resend" three times does not end up with three live links.
 */
export async function issueAuthToken(
  userId: string,
  type: AuthTokenType,
  target?: string,
): Promise<IssuedAuthToken> {
  const token = type === 'PHONE_OTP' ? generateOtp() : randomToken()
  const expiresAt = new Date(Date.now() + AUTH_TOKEN_TTL_SECONDS[type] * 1000)

  await prisma.$transaction([
    prisma.authToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.authToken.create({
      data: { userId, type, tokenHash: hashToken(token), expiresAt, target: target ?? null },
    }),
  ])

  return { token, expiresAt }
}

/** Six digits, uniformly distributed — `Math.random()` is not a source for a credential. */
function generateOtp(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0')
}

export type AuthTokenOutcome =
  | { status: 'valid'; userId: string; target: string | null }
  | { status: 'unknown' }
  | { status: 'expired' }
  | { status: 'used' }
  | { status: 'too_many_attempts' }

/**
 * Consume a token. Single-use: a valid token is marked used in the same statement that
 * reads it, so two concurrent requests cannot both succeed.
 */
export async function consumeAuthToken(
  token: string,
  type: AuthTokenType,
): Promise<AuthTokenOutcome> {
  const tokenHash = hashToken(token)
  const existing = await prisma.authToken.findUnique({ where: { tokenHash } })

  if (existing === null || existing.type !== type) return { status: 'unknown' }
  if (existing.usedAt !== null) return { status: 'used' }
  if (existing.attempts >= OTP_MAX_ATTEMPTS) return { status: 'too_many_attempts' }
  if (existing.expiresAt.getTime() <= Date.now()) return { status: 'expired' }

  const consumed = await prisma.authToken.updateMany({
    where: { id: existing.id, usedAt: null },
    data: { usedAt: new Date() },
  })

  // Lost the race with a concurrent consumer.
  if (consumed.count === 0) return { status: 'used' }

  return { status: 'valid', userId: existing.userId, target: existing.target }
}

/**
 * Record a failed attempt against the outstanding token of a type. Only OTPs need this —
 * a six-digit code is guessable and the attempt cap is what stops that.
 */
export async function recordAuthTokenAttempt(userId: string, type: AuthTokenType): Promise<void> {
  await prisma.authToken.updateMany({
    where: { userId, type, usedAt: null },
    data: { attempts: { increment: 1 } },
  })
}
