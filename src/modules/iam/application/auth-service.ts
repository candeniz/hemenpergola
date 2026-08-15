import 'server-only'

import { prisma } from '@/shared/db'
import { conflict, err, forbidden, ok, rateLimited, type DomainError } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

import { validatePassword } from '../domain/password'
import { getCaptchaProvider } from '../infrastructure/captcha'
import { burnPasswordTime, hashPassword, verifyPassword } from '../infrastructure/password-hasher'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  issueAccessToken,
  issueAuthToken,
  issueRefreshToken,
  revokeAllFamilies,
  revokeFamily,
  rotateRefreshToken,
} from '../infrastructure/token-service'
import type { LoginInput, LogoutInput, RefreshInput, RegisterInput } from './dto'

/**
 * Authentication use cases — `12-authentication-authorization.md` §Credentials, §Tokens,
 * §Abuse controls.
 *
 * Every method here is registered through `serviceMethod`, which is what puts it in the
 * authorisation matrix. Three of the four are `anonymous` for the obvious reason: you
 * cannot be signed in while signing in. Each says why in its declaration, because
 * "anonymous" should be a sentence somebody wrote.
 */

/** 12 §Abuse controls: progressive delay after 5 failed logins per account. */
const FAILED_LOGINS_BEFORE_DELAY = 5
const FAILED_LOGINS_BEFORE_CAPTCHA = 10
/**
 * The single answer every failed authentication gives.
 *
 * `05-system-architecture.md` §Errors defines exactly seven error kinds and none of them is
 * `UNAUTHORIZED` — the taxonomy is closed on purpose, so this maps onto `FORBIDDEN` (403)
 * rather than growing an eighth kind for one endpoint.
 *
 * More importantly it is **one** value: unknown email, wrong password and suspended account
 * all return this, so no branch is distinguishable by its error (`12` §Credentials).
 */
function invalidCredentials(): DomainError {
  return forbidden('auth:credentials')
}

const MAX_PROGRESSIVE_DELAY_MS = 8_000

export function progressiveDelayMs(failedCount: number): number {
  if (failedCount < FAILED_LOGINS_BEFORE_DELAY) return 0
  // 1s, 2s, 4s, 8s, then flat. Slow enough to ruin an online guess, short enough that a
  // person who genuinely forgot their password is not locked out of their own account —
  // `12` chose a delay rather than a lockout for exactly that reason.
  const step = failedCount - FAILED_LOGINS_BEFORE_DELAY
  return Math.min(1000 * 2 ** step, MAX_PROGRESSIVE_DELAY_MS)
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export type AuthTokens = {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export type RegisterResult = {
  userId: string
  /** Never the token itself — the caller sends it by email, it does not go in the response. */
  emailVerificationSent: boolean
}

/**
 * Register.
 *
 * **The response does not reveal whether the email already exists** (`12` §Credentials).
 * A duplicate registration returns the same shape as a new one and the truth arrives by
 * email — "you already have an account, here is a reset link" — which reaches the person
 * who owns the address and nobody else.
 */
export const register = serviceMethod<RegisterInput, RegisterResult>(
  'auth',
  'register',
  { kind: 'anonymous', why: 'creating the account that would be the subject of a permission' },
  async (actor, input) => {
    const problems = validatePassword(input.password)
    if (problems.length > 0) {
      return err(conflict(`password rejected: ${problems.map((p) => p.kind).join(', ')}`))
    }

    const existing = await prisma.user.findUnique({ where: { email: input.email } })

    if (existing !== null) {
      // Same work, same shape, same answer. The account owner gets an email; the person
      // probing the endpoint learns nothing.
      await burnPasswordTime(input.password)
      return ok({ userId: existing.id, emailVerificationSent: true })
    }

    const user = await prisma.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        locale: input.locale,
        passwordHash: await hashPassword(input.password),
      },
    })

    await issueAuthToken(user.id, 'EMAIL_VERIFICATION', input.email)
    void actor

    return ok({ userId: user.id, emailVerificationSent: true })
  },
)

/**
 * Log in.
 *
 * The unknown-email and wrong-password paths must be indistinguishable — in shape *and* in
 * time (`12` §Credentials). Shape is easy. Time is the part that needs `burnPasswordTime`:
 * without it, an unknown email returns in microseconds while a wrong password pays the
 * Argon2 cost, and the endpoint becomes an account-enumeration oracle no matter how
 * identical the JSON is. `credentials.test.ts` measures both paths.
 */
export const login = serviceMethod<LoginInput, AuthTokens>(
  'auth',
  'login',
  { kind: 'anonymous', why: 'exchanging credentials for the session that carries permissions' },
  async (actor, input) => {
    const user = await prisma.user.findUnique({ where: { email: input.email } })

    if (user === null || user.passwordHash === null) {
      await burnPasswordTime(input.password)
      return err(invalidCredentials())
    }

    // The delay is paid before the answer, based on this account's failure count.
    await delay(progressiveDelayMs(user.failedLoginCount))

    if (user.failedLoginCount >= FAILED_LOGINS_BEFORE_CAPTCHA) {
      const captcha = getCaptchaProvider()
      if (captcha.enforcing) {
        const verdict = await captcha.verify(null, { ip: actor.ip })
        if (!verdict.passed) {
          return err(rateLimited(Math.ceil(progressiveDelayMs(user.failedLoginCount) / 1000)))
        }
      }
      // With no provider configured the login proceeds — see Q10. The alternative, locking
      // the account out entirely, would turn a missing decision into an outage.
    }

    if (user.status === 'SUSPENDED') {
      // Same answer as a wrong password: whether an account is suspended is not something
      // an unauthenticated caller gets to learn.
      await burnPasswordTime(input.password)
      return err(invalidCredentials())
    }

    const correct = await verifyPassword(input.password, user.passwordHash)

    if (!correct) {
      const failedLoginCount = user.failedLoginCount + 1

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount,
          lastFailedLoginAt: new Date(),
          // The lockout notification goes out once per streak, not on every attempt —
          // five emails in five seconds is itself the attack (`12` §Abuse controls).
          ...(failedLoginCount === FAILED_LOGINS_BEFORE_DELAY
            ? { lockoutNotifiedAt: new Date() }
            : {}),
        },
      })

      return err(invalidCredentials())
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lastFailedLoginAt: null, lockoutNotifiedAt: null },
    })

    const refresh = await issueRefreshToken(user.id, {
      ip: actor.ip,
      userAgent: actor.userAgent,
    })

    return ok({
      accessToken: await issueAccessToken(user.id, user.globalRole),
      refreshToken: refresh.token,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    })
  },
)

/**
 * Rotate a refresh token.
 *
 * A replayed token kills the whole family (`12` §Tokens). The caller cannot tell which of
 * the branches it hit — every failure returns the same error — because the difference
 * between "expired" and "someone else used this" is exactly what an attacker wants to know.
 */
export const refresh = serviceMethod<RefreshInput, AuthTokens>(
  'auth',
  'refresh',
  { kind: 'anonymous', why: 'the refresh token is itself the credential; no session exists yet' },
  async (actor, input) => {
    const outcome = await rotateRefreshToken(input.refreshToken, {
      ip: actor.ip,
      userAgent: actor.userAgent,
    })

    if (outcome.status !== 'rotated') {
      return err(invalidCredentials())
    }

    const user = await prisma.user.findUnique({ where: { id: outcome.userId } })
    if (user === null || user.status === 'SUSPENDED') {
      await revokeFamily(outcome.refresh.familyId, 'user_unavailable')
      return err(invalidCredentials())
    }

    return ok({
      accessToken: await issueAccessToken(user.id, user.globalRole),
      refreshToken: outcome.refresh.token,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    })
  },
)

export type LogoutResult = { revokedFamilies: number }

/** Log out. `allDevices` kills every family; otherwise just the one presented. */
export const logout = serviceMethod<LogoutInput, LogoutResult>(
  'auth',
  'logout',
  { kind: 'authenticated' },
  async (actor, input) => {
    if (actor.userId === null) return err(invalidCredentials())

    if (input.allDevices) {
      return ok({ revokedFamilies: await revokeAllFamilies(actor.userId, 'logout_all') })
    }

    if (input.refreshToken === undefined) {
      return ok({ revokedFamilies: 0 })
    }

    const outcome = await rotateRefreshToken(input.refreshToken)
    if (outcome.status === 'rotated') {
      await revokeFamily(outcome.refresh.familyId, 'logout')
      return ok({ revokedFamilies: 1 })
    }

    return ok({ revokedFamilies: 0 })
  },
)

export const authService = { register, login, refresh, logout } satisfies Record<
  string,
  { meta: unknown }
>

export type AuthService = typeof authService
