import 'server-only'

import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { brandName } from '@/modules/notification/domain/brand'
import {
  accountAlreadyExistsEmail,
  emailVerificationEmail,
  lockoutNoticeEmail,
  passwordResetEmail,
  phoneOtpSms,
} from '@/modules/notification/domain/templates'
import { getMailer, type Email } from '@/modules/notification/infrastructure/mailer'
import { getSmsSender } from '@/modules/notification/infrastructure/sms-sender'
import { env } from '@/shared/config/env'
import { prisma } from '@/shared/db'
import { consumeAuthRateLimit } from '@/shared/rate-limit'
import {
  conflict,
  dependency,
  err,
  forbidden,
  notFound,
  ok,
  precondition,
  rateLimited,
  type DomainError,
} from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

import { consentTextVersion } from '../domain/consent-text'
import { validatePassword } from '../domain/password'
import { getCaptchaProvider } from '../infrastructure/captcha'
import { burnPasswordTime, hashPassword, verifyPassword } from '../infrastructure/password-hasher'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  consumeAuthToken,
  familyOfToken,
  issueAccessToken,
  issueAuthToken,
  issueRefreshToken,
  listSessionFamilies,
  recordAuthTokenAttempt,
  revokeAllFamilies,
  revokeFamily,
  rotateRefreshToken,
} from '../infrastructure/token-service'
import type {
  ConfirmPhoneVerificationInput,
  ListSessionsInput,
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
  RequestPasswordResetInput,
  ResendEmailVerificationInput,
  ResetPasswordInput,
  RevokeSessionInput,
  StartPhoneVerificationInput,
  VerifyEmailInput,
} from './dto'

// Phase 11.2: the result types moved to ./dto with the schemas.
export {
  type AuthTokens,
  type ConfirmPhoneVerificationResult,
  type ListSessionsResult,
  type LoginResult,
  type LogoutResult,
  type RegisterResult,
  type RequestPasswordResetResult,
  type ResetPasswordResult,
  type RevokeSessionResult,
  type StartPhoneVerificationResult,
  type VerifyEmailResult,
} from './dto'
import type {
  AuthTokens,
  ConfirmPhoneVerificationResult,
  ListSessionsResult,
  LoginResult,
  LogoutResult,
  RegisterResult,
  RequestPasswordResetResult,
  ResetPasswordResult,
  RevokeSessionResult,
  StartPhoneVerificationResult,
  VerifyEmailResult,
} from './dto'

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

/**
 * The `06` §Rate limits row for the auth surface: 10 / 15 min, per IP **and** per account.
 *
 * Applied to every anonymous auth method, not only login. Registration, "forgot my
 * password" and "resend the link" all send mail to an address the caller names, so an
 * unlimited one is a way to have this platform deliver somebody else's harassment.
 *
 * The account dimension is keyed on the address, not a user id, so an attempt against an
 * address with no account is counted too — otherwise the limit is avoided by guessing
 * addresses instead of passwords.
 */
async function underAuthRateLimit(
  actor: { ip: string },
  account: string,
): Promise<DomainError | null> {
  const verdict = await consumeAuthRateLimit(actor.ip, account)
  return verdict.allowed ? null : rateLimited(verdict.retryAfterSeconds)
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * A link into the app.
 *
 * `AUTH_URL` is the app's public origin (`23-deployment-and-environments.md`
 * §Configuration). Paths are the Turkish ones: `tr` is the default locale and is
 * unprefixed, so a link built here works for the majority and `en` users are redirected
 * by the middleware rather than sent a broken URL.
 */
function appLink(path: string): string {
  return new URL(path, env.AUTH_URL).toString()
}

/**
 * Send mail without letting a mail failure fail the use case.
 *
 * A provider outage must not roll back a completed registration — the user would have an
 * account they could not be told about *and* an error page saying it failed. The link can be
 * re-requested; the account cannot be un-created.
 */
async function sendMail(to: string, body: { subject: string; text: string }): Promise<void> {
  const email: Email = { to, subject: body.subject, text: body.text }
  try {
    await getMailer().send(email)
  } catch (error) {
    console.error('[mail] send failed', body.subject, error)
  }
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
    const limited = await underAuthRateLimit(actor, input.email)
    if (limited !== null) return err(limited)

    const problems = validatePassword(input.password)
    if (problems.length > 0) {
      return err(conflict(`password rejected: ${problems.map((p) => p.kind).join(', ')}`))
    }

    const existing = await prisma.user.findUnique({ where: { email: input.email } })

    if (existing !== null) {
      // Same work, same shape, same answer. The account owner gets an email; the person
      // probing the endpoint learns nothing — and the one who *does* own the address gets
      // told, with the reset link they would actually have wanted.
      await burnPasswordTime(input.password)
      const reset = await issueAuthToken(existing.id, 'PASSWORD_RESET', input.email)
      await sendMail(
        input.email,
        accountAlreadyExistsEmail(appLink(`/sifre-yenile?token=${reset.token}`), brandName()),
      )
      return ok({ userId: existing.id, emailVerificationSent: true })
    }

    const passwordHash = await hashPassword(input.password)

    /*
     * The account and its consent record are written in one transaction.
     *
     * `19-security-and-kvkk.md` §Consent treats consent as evidence, and evidence written
     * *after* the thing it evidences goes missing exactly when the second write fails. An
     * account with no consent row is an account nobody can prove agreed to anything.
     */
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          locale: input.locale,
          passwordHash,
        },
      })

      await tx.consent.create({
        data: {
          userId: created.id,
          type: 'TERMS',
          // Derived from the file's bytes, never a constant — `domain/consent-text.ts`
          // says why at length.
          textVersion: consentTextVersion('TERMS', input.locale),
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
      })

      return created
    })

    const verification = await issueAuthToken(user.id, 'EMAIL_VERIFICATION', input.email)
    await sendMail(
      input.email,
      emailVerificationEmail(appLink(`/eposta-dogrula?token=${verification.token}`), brandName()),
    )

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
export const login = serviceMethod<LoginInput, LoginResult>(
  'auth',
  'login',
  { kind: 'anonymous', why: 'exchanging credentials for the session that carries permissions' },
  async (actor, input) => {
    const limited = await underAuthRateLimit(actor, input.email)
    if (limited !== null) return err(limited)

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

      if (failedLoginCount === FAILED_LOGINS_BEFORE_DELAY) {
        await sendMail(user.email, lockoutNoticeEmail(brandName()))
      }

      // Deliberately *not* attributed: whoever typed the wrong password may not be the
      // account owner, and recording them as the actor would put an innocent user's id on
      // an attacker's attempt. `entityId` names the account that was targeted, which is the
      // fact that is actually known.
      await recordAudit(actor, {
        action: 'login_failed',
        entityType: 'User',
        entityId: user.id,
        reason: `attempt ${failedLoginCount}`,
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

    /*
     * Attributed to the user, not to the anonymous context the request arrived with.
     *
     * `resolveActor` runs before the credentials are checked, so `actor.userId` is null all
     * the way through a login — and an audit row that leaves "who did this" blank on the one
     * event where the answer is certain is not an audit row. The rest of the context (IP,
     * user agent) is the request's.
     */
    await recordAudit(
      { ...actor, userId: user.id },
      {
        action: 'login',
        entityType: 'User',
        entityId: user.id,
        after: { familyId: refresh.familyId },
      },
    )

    const { startWebSession } = await import('../infrastructure/web-session')

    return ok({
      userId: user.id,
      accessToken: await issueAccessToken(user.id, user.globalRole),
      refreshToken: refresh.token,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      webSession: await startWebSession(user.id),
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
      userId: user.id,
      accessToken: await issueAccessToken(user.id, user.globalRole),
      refreshToken: outcome.refresh.token,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    })
  },
)

/** Log out. `allDevices` kills every family; otherwise just the one presented. */
/**
 * Close one browser session — `ADR-022`.
 *
 * Separate from `logout` because they close different things: `logout` revokes an API
 * refresh-token family, this deletes a `Session` row. A caller signing out of a browser has
 * no refresh token to name, and a mobile client has no cookie.
 *
 * `authenticated` rather than `customer-owned`: the token itself is the credential, and the
 * delete is scoped by it. Signing out twice is not an error.
 */
export const endWebSession = serviceMethod<{ sessionToken: string }, { signedOut: true }>(
  'auth',
  'endWebSession',
  { kind: 'authenticated' },
  async (actor, input) => {
    void actor
    const { endWebSession: end } = await import('../infrastructure/web-session')
    await end(input.sessionToken)
    return ok({ signedOut: true as const })
  },
)

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

// ── Password reset (`12` §Recovery) ──────────────────────────────────────────

/**
 * Ask for a reset link.
 *
 * Always returns `{ sent: true }`, for a known address and an unknown one alike. "No account
 * with that email" is the same disclosure as a login that distinguishes its failures, just
 * on a page nobody thought to watch.
 */
export const requestPasswordReset = serviceMethod<
  RequestPasswordResetInput,
  RequestPasswordResetResult
>(
  'auth',
  'requestPasswordReset',
  { kind: 'anonymous', why: 'the person asking has by definition lost their credential' },
  async (actor, input) => {
    const limited = await underAuthRateLimit(actor, input.email)
    if (limited !== null) return err(limited)

    const user = await prisma.user.findUnique({ where: { email: input.email } })

    if (user !== null && user.status !== 'SUSPENDED') {
      const issued = await issueAuthToken(user.id, 'PASSWORD_RESET', input.email)
      await sendMail(
        input.email,
        passwordResetEmail(appLink(`/sifre-yenile?token=${issued.token}`), brandName()),
      )
    }

    return ok({ sent: true } as const)
  },
)

/**
 * Complete a reset.
 *
 * **It revokes every other session** (`12` §Sessions and revocation). The likeliest reason
 * somebody resets a password is that they believe someone else has it, and a reset that
 * leaves the intruder's thirty-day refresh token alive has fixed nothing.
 */
export const resetPassword = serviceMethod<ResetPasswordInput, ResetPasswordResult>(
  'auth',
  'resetPassword',
  { kind: 'anonymous', why: 'the reset token is itself the credential being presented' },
  async (actor, input) => {
    // Keyed on the token rather than an address, because the caller supplies no address
    // here. That still bounds a caller working through guessed tokens: each guess is a
    // distinct bucket, but the IP dimension is shared and fills after ten.
    const limited = await underAuthRateLimit(actor, `reset:${input.token.slice(0, 16)}`)
    if (limited !== null) return err(limited)

    const problems = validatePassword(input.password)
    if (problems.length > 0) {
      return err(conflict(`password rejected: ${problems.map((p) => p.kind).join(', ')}`))
    }

    const outcome = await consumeAuthToken(input.token, 'PASSWORD_RESET')
    if (outcome.status !== 'valid') {
      // Expired, already used and never-existed are one answer: somebody working through a
      // list of guessed tokens learns nothing about which of them were ever real.
      return err(forbidden('auth:reset-token'))
    }

    const passwordHash = await hashPassword(input.password)

    await prisma.user.update({
      where: { id: outcome.userId },
      data: {
        passwordHash,
        // Completing a reset proves the address receives mail, and ends the failure streak.
        emailVerifiedAt: new Date(),
        failedLoginCount: 0,
        lastFailedLoginAt: null,
        lockoutNotifiedAt: null,
      },
    })

    /*
     * Both kinds of session, or the promise is half kept.
     *
     * `revokeAllFamilies` kills the API refresh-token families. Until `ADR-022` that was every
     * session there was; now a browser session is a `Session` row, and leaving those alive
     * would mean the reset signed out the phone and left the intruder's browser logged in —
     * which is the opposite of the reason people reset passwords.
     */
    const { endAllWebSessions } = await import('../infrastructure/web-session')

    const [revokedFamilies, revokedWeb] = await Promise.all([
      revokeAllFamilies(outcome.userId, 'password_reset'),
      endAllWebSessions(outcome.userId),
    ])

    const revokedSessions = revokedFamilies + revokedWeb

    // Same reasoning as login: the reset arrives on an anonymous request, but the token came
    // out of this user's mailbox, so the actor is known by the time the row is written.
    await recordAudit(
      { ...actor, userId: outcome.userId },
      {
        action: 'password_reset',
        entityType: 'User',
        entityId: outcome.userId,
        after: { revokedSessions },
      },
    )

    return ok({ revokedSessions })
  },
)

// ── Email verification (`12` §Verification gates) ────────────────────────────

export const verifyEmail = serviceMethod<VerifyEmailInput, VerifyEmailResult>(
  'auth',
  'verifyEmail',
  { kind: 'anonymous', why: 'the link is opened from a mail client, usually not signed in' },
  async (actor, input) => {
    const limited = await underAuthRateLimit(actor, `verify:${input.token.slice(0, 16)}`)
    if (limited !== null) return err(limited)

    const outcome = await consumeAuthToken(input.token, 'EMAIL_VERIFICATION')
    if (outcome.status !== 'valid') return err(forbidden('auth:verification-token'))

    await prisma.user.update({
      where: {
        id: outcome.userId,
        // The token was issued against one address; if the user has changed it since, the
        // token verifies nothing. In the `where` clause, not a comparison after the fetch.
        ...(outcome.target === null ? {} : { email: outcome.target }),
      },
      data: { emailVerifiedAt: new Date() },
    })

    void actor
    return ok({ verified: true } as const)
  },
)

export const resendEmailVerification = serviceMethod<
  ResendEmailVerificationInput,
  RequestPasswordResetResult
>(
  'auth',
  'resendEmailVerification',
  { kind: 'anonymous', why: 'a user who cannot verify their email often cannot sign in either' },
  async (actor, input) => {
    const limited = await underAuthRateLimit(actor, input.email)
    if (limited !== null) return err(limited)

    const user = await prisma.user.findUnique({ where: { email: input.email } })

    if (user !== null && user.emailVerifiedAt === null) {
      const issued = await issueAuthToken(user.id, 'EMAIL_VERIFICATION', input.email)
      await sendMail(
        input.email,
        emailVerificationEmail(appLink(`/eposta-dogrula?token=${issued.token}`), brandName()),
      )
    }

    return ok({ sent: true } as const)
  },
)

// ── Phone verification (`26-execution-plan.md` row 1.5) ──────────────────────

/** 60 seconds between codes, so "resend" is not an SMS bill. */
export const OTP_RESEND_INTERVAL_SECONDS = 60

export const startPhoneVerification = serviceMethod<
  StartPhoneVerificationInput,
  StartPhoneVerificationResult
>('auth', 'startPhoneVerification', { kind: 'authenticated' }, async (actor, input) => {
  if (actor.userId === null) return err(forbidden('auth:session'))

  const recent = await prisma.authToken.findFirst({
    where: { userId: actor.userId, type: 'PHONE_OTP' },
    orderBy: { createdAt: 'desc' },
  })

  if (recent !== null) {
    const elapsed = (Date.now() - recent.createdAt.getTime()) / 1000
    if (elapsed < OTP_RESEND_INTERVAL_SECONDS) {
      // Every SMS costs money, and a resend button is the cheapest way to spend somebody
      // else's. A 429 carrying the wait, not a silent no-op that looks like success.
      return err(rateLimited(Math.ceil(OTP_RESEND_INTERVAL_SECONDS - elapsed)))
    }
  }

  // The number is stored unverified here. `phoneVerifiedAt` is what the gates read, and only
  // `confirmPhoneVerification` sets it.
  await prisma.user.update({
    where: { id: actor.userId },
    data: { phone: input.phone, phoneVerifiedAt: null },
  })

  const issued = await issueAuthToken(actor.userId, 'PHONE_OTP', input.phone)

  try {
    await getSmsSender().send({ to: input.phone, text: phoneOtpSms(issued.token, brandName()) })
  } catch (error) {
    console.error('[sms] send failed', error)
    return err(dependency('sms'))
  }

  return ok({ sent: true as const, expiresAt: issued.expiresAt })
})

export const confirmPhoneVerification = serviceMethod<
  ConfirmPhoneVerificationInput,
  ConfirmPhoneVerificationResult
>('auth', 'confirmPhoneVerification', { kind: 'authenticated' }, async (actor, input) => {
  if (actor.userId === null) return err(forbidden('auth:session'))

  const outcome = await consumeAuthToken(input.code, 'PHONE_OTP')

  if (outcome.status !== 'valid' || outcome.userId !== actor.userId) {
    /*
     * Six digits is a million guesses, which is nothing — the attempt cap is the only thing
     * that makes an OTP a credential at all. The failure counts against *this user's*
     * outstanding code, and after five the code is dead and a new one must be requested.
     */
    await recordAuthTokenAttempt(actor.userId, 'PHONE_OTP')

    if (outcome.status === 'too_many_attempts') {
      return err(rateLimited(OTP_RESEND_INTERVAL_SECONDS))
    }
    return err(forbidden('auth:otp'))
  }

  await prisma.user.update({
    where: {
      id: actor.userId,
      // The code went to a number; if the number has changed since, it proves nothing.
      ...(outcome.target === null ? {} : { phone: outcome.target }),
    },
    data: { phoneVerifiedAt: new Date() },
  })

  return ok({ verified: true } as const)
})

// ── Sessions (`12` §Sessions and revocation) ─────────────────────────────────

export const listSessions = serviceMethod<ListSessionsInput, ListSessionsResult>(
  'auth',
  'listSessions',
  { kind: 'owner', describe: 'RefreshToken rows where userId is the actor’s own' },
  async (actor, input) => {
    void input
    if (actor.userId === null) return err(forbidden('auth:session'))

    // Scoped by userId inside the query. There is no parameter that could widen it.
    return ok({ sessions: await listSessionFamilies(actor.userId) })
  },
)

export const revokeSession = serviceMethod<RevokeSessionInput, RevokeSessionResult>(
  'auth',
  'revokeSession',
  { kind: 'owner', describe: 'RefreshToken family scoped by userId in the where clause' },
  async (actor, input) => {
    if (actor.userId === null) return err(forbidden('auth:session'))

    if (input.allOthers) {
      const currentFamily =
        input.currentRefreshToken === undefined
          ? undefined
          : ((await familyOfToken(input.currentRefreshToken)) ?? undefined)

      const revoked = await revokeAllFamilies(actor.userId, 'revoked_by_user', currentFamily)

      await recordAudit(actor, {
        action: 'session_revoked',
        entityType: 'User',
        entityId: actor.userId,
        after: { scope: 'all_others', revoked },
      })

      return ok({ revoked })
    }

    if (input.familyId === undefined) {
      return err(precondition('either familyId or allOthers'))
    }

    /*
     * Ownership lives in the `where` clause (`CLAUDE.md` non-negotiable 3). Fetching the
     * family and then comparing `userId` in JavaScript would behave identically today and
     * be a hole the first time somebody adds an early return above the comparison.
     */
    const revoked = await prisma.refreshToken.updateMany({
      where: { familyId: input.familyId, userId: actor.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'revoked_by_user' },
    })

    if (revoked.count === 0) {
      // Somebody else's family and a family that never existed get the same answer.
      return err(notFound('Session'))
    }

    await recordAudit(actor, {
      action: 'session_revoked',
      entityType: 'User',
      entityId: actor.userId,
      after: { familyId: input.familyId, revoked: revoked.count },
    })

    return ok({ revoked: revoked.count })
  },
)

export const authService = {
  register,
  login,
  refresh,
  logout,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
  resendEmailVerification,
  startPhoneVerification,
  confirmPhoneVerification,
  listSessions,
  revokeSession,
} satisfies Record<string, { meta: unknown }>

export type AuthService = typeof authService
