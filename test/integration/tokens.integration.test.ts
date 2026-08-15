import { describe, expect, it } from 'vitest'

import { login, refresh, register } from '@/modules/iam/application/auth-service'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_TOKEN_TTL_SECONDS,
  consumeAuthToken,
  hashToken,
  issueAccessToken,
  issueAuthToken,
  issueRefreshToken,
  revokeAllFamilies,
  rotateRefreshToken,
  verifyAccessToken,
} from '@/modules/iam/infrastructure/token-service'
import { anonymousActor } from '@/shared/context/actor'

import { getPrisma } from './setup'

/** `12-authentication-authorization.md` §Tokens — task 1.3. */

const PASSWORD = 'token-test-password'

async function makeUser(email: string): Promise<string> {
  const result = await register(anonymousActor(), {
    email,
    password: PASSWORD,
    fullName: 'Token Test',
    locale: 'tr',
  })
  if (!result.ok) throw new Error('register failed')
  return result.value.userId
}

describe('access token claims', () => {
  it('carries exactly sub, role, jti, iat, exp — and no companyId', async () => {
    const token = await issueAccessToken('usr_123', 'CUSTOMER')
    const claims = await verifyAccessToken(token)

    expect(claims).not.toBeNull()
    if (claims === null) return

    expect(claims.sub).toBe('usr_123')
    expect(claims.role).toBe('CUSTOMER')

    /*
     * The assertion this whole test exists for. `12` §Tokens: no `companyId` claim, because
     * company scope is resolved per request from the path — which is what makes revoking a
     * membership take effect on the next request instead of at token expiry.
     *
     * Decoding the raw payload rather than the typed result, because the type would hide a
     * claim that was added "just for convenience".
     */
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as Record<string, unknown>

    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'jti', 'role', 'sub'])
    expect(payload).not.toHaveProperty('companyId')
    expect(payload).not.toHaveProperty('companyRole')
  })

  it('expires in fifteen minutes', async () => {
    const token = await issueAccessToken('usr_123', 'CUSTOMER')
    const claims = await verifyAccessToken(token)
    if (claims === null) throw new Error('no claims')

    expect(claims.exp - claims.iat).toBe(ACCESS_TOKEN_TTL_SECONDS)
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(15 * 60)
  })

  it('rejects a tampered or foreign token without saying why', async () => {
    const token = await issueAccessToken('usr_123', 'ADMIN')

    expect(await verifyAccessToken(`${token}x`)).toBeNull()
    expect(await verifyAccessToken('not.a.token')).toBeNull()
    expect(await verifyAccessToken('')).toBeNull()
  })

  it('gives every token a distinct jti', async () => {
    const first = await verifyAccessToken(await issueAccessToken('usr_1', 'CUSTOMER'))
    const second = await verifyAccessToken(await issueAccessToken('usr_1', 'CUSTOMER'))

    expect(first?.jti).not.toBe(second?.jti)
  })
})

describe('refresh token rotation and reuse detection', () => {
  it('rotates, keeping the family and invalidating the old token', async () => {
    const userId = await makeUser('rotate@example.com')
    const first = await issueRefreshToken(userId)

    const rotated = await rotateRefreshToken(first.token)
    expect(rotated.status).toBe('rotated')
    if (rotated.status !== 'rotated') return

    expect(rotated.refresh.familyId).toBe(first.familyId)
    expect(rotated.refresh.token).not.toBe(first.token)

    // The new one works.
    const again = await rotateRefreshToken(rotated.refresh.token)
    expect(again.status).toBe('rotated')
  }, 60_000)

  it('revokes the entire family when a used token is replayed', async () => {
    /*
     * The branch that matters. A refresh token is single-use, so the only way a *used* one
     * arrives again is that somebody else has a copy — the legitimate client has already
     * moved on to its successor. There is no way to tell which caller is the thief, so both
     * lose the session. Losing one login is cheap; leaving a stolen token valid for thirty
     * days is not (`12` §Tokens).
     */
    const userId = await makeUser('reuse@example.com')
    const first = await issueRefreshToken(userId)

    const rotated = await rotateRefreshToken(first.token)
    if (rotated.status !== 'rotated') throw new Error('expected rotation')

    // Replay the original — the one the thief kept.
    const replay = await rotateRefreshToken(first.token)
    expect(replay.status).toBe('reuse_detected')

    // Every token in the family is now dead, including the one the honest client holds.
    const successor = await rotateRefreshToken(rotated.refresh.token)
    expect(successor.status).toBe('revoked')

    const family = await getPrisma().refreshToken.findMany({
      where: { familyId: first.familyId },
    })
    expect(family.length).toBeGreaterThanOrEqual(2)
    expect(family.every((token) => token.revokedAt !== null)).toBe(true)
    expect(family.every((token) => token.revokedReason === 'reuse_detected')).toBe(true)
  }, 60_000)

  it('does not distinguish its failures to the caller', async () => {
    const userId = await makeUser('opaque@example.com')
    const issued = await issueRefreshToken(userId)
    await rotateRefreshToken(issued.token)

    const unknown = await refresh(anonymousActor(), { refreshToken: 'nonexistent-token' })
    const replayed = await refresh(anonymousActor(), { refreshToken: issued.token })

    expect(unknown.ok).toBe(false)
    expect(replayed.ok).toBe(false)
    if (unknown.ok || replayed.ok) return

    // "Expired" and "someone else used this" are exactly what an attacker wants to learn.
    expect(unknown.error).toEqual(replayed.error)
  }, 60_000)

  it('stores only a hash, never the token', async () => {
    const userId = await makeUser('hashed@example.com')
    const issued = await issueRefreshToken(userId)

    const stored = await getPrisma().refreshToken.findUnique({
      where: { tokenHash: hashToken(issued.token) },
    })

    expect(stored).not.toBeNull()

    // A database dump must not be a set of working credentials.
    const anyMatchingPlaintext = await getPrisma().refreshToken.findMany({
      where: { tokenHash: issued.token },
    })
    expect(anyMatchingPlaintext).toEqual([])
  }, 60_000)

  it('revokes every family on demand — what a password change does', async () => {
    const userId = await makeUser('revoke-all@example.com')
    await issueRefreshToken(userId)
    await issueRefreshToken(userId)

    const revoked = await revokeAllFamilies(userId, 'password_change')
    expect(revoked).toBeGreaterThanOrEqual(2)

    const live = await getPrisma().refreshToken.findMany({ where: { userId, revokedAt: null } })
    expect(live).toEqual([])
  }, 60_000)

  it('issues a working pair from login', async () => {
    const email = 'login-pair@example.com'
    await makeUser(email)

    const result = await login(anonymousActor(), { email, password: PASSWORD })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.expiresIn).toBe(ACCESS_TOKEN_TTL_SECONDS)
    expect(await verifyAccessToken(result.value.accessToken)).not.toBeNull()

    const rotated = await refresh(anonymousActor(), { refreshToken: result.value.refreshToken })
    expect(rotated.ok).toBe(true)
  }, 120_000)
})

describe('verification tokens', () => {
  it('stores them hashed with the lifetimes 12 §Tokens fixes', async () => {
    const userId = await makeUser('verification@example.com')

    expect(AUTH_TOKEN_TTL_SECONDS.EMAIL_VERIFICATION).toBe(24 * 60 * 60)
    expect(AUTH_TOKEN_TTL_SECONDS.PASSWORD_RESET).toBe(60 * 60)
    expect(AUTH_TOKEN_TTL_SECONDS.PHONE_OTP).toBe(5 * 60)

    const issued = await issueAuthToken(userId, 'PASSWORD_RESET')
    const stored = await getPrisma().authToken.findUnique({
      where: { tokenHash: hashToken(issued.token) },
    })

    expect(stored?.type).toBe('PASSWORD_RESET')
    expect(stored?.tokenHash).not.toBe(issued.token)

    const ttlSeconds = Math.round((issued.expiresAt.getTime() - Date.now()) / 1000)
    expect(ttlSeconds).toBeGreaterThan(3500)
    expect(ttlSeconds).toBeLessThanOrEqual(3600)
  }, 60_000)

  it('is single-use', async () => {
    const userId = await makeUser('single-use@example.com')
    const issued = await issueAuthToken(userId, 'EMAIL_VERIFICATION')

    const first = await consumeAuthToken(issued.token, 'EMAIL_VERIFICATION')
    expect(first.status).toBe('valid')

    const second = await consumeAuthToken(issued.token, 'EMAIL_VERIFICATION')
    expect(second.status).toBe('used')
  }, 60_000)

  it('invalidates the previous token when a new one is issued', async () => {
    // Three clicks on "resend" must not leave three live links.
    const userId = await makeUser('resend@example.com')
    const first = await issueAuthToken(userId, 'PASSWORD_RESET')
    const second = await issueAuthToken(userId, 'PASSWORD_RESET')

    expect((await consumeAuthToken(first.token, 'PASSWORD_RESET')).status).toBe('used')
    expect((await consumeAuthToken(second.token, 'PASSWORD_RESET')).status).toBe('valid')
  }, 60_000)

  it('will not accept a token of the wrong type', async () => {
    const userId = await makeUser('wrong-type@example.com')
    const issued = await issueAuthToken(userId, 'EMAIL_VERIFICATION')

    expect((await consumeAuthToken(issued.token, 'PASSWORD_RESET')).status).toBe('unknown')
  }, 60_000)

  it('generates a six-digit OTP', async () => {
    const userId = await makeUser('otp@example.com')
    const issued = await issueAuthToken(userId, 'PHONE_OTP', '+905551234567')

    expect(issued.token).toMatch(/^\d{6}$/)
  }, 60_000)
})
