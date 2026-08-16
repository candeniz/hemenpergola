'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

import type {
  AuthTokens,
  LoginResult,
  ConfirmPhoneVerificationResult,
  ListSessionsResult,
  RegisterResult,
  RequestPasswordResetResult,
  ResetPasswordResult,
  RevokeSessionResult,
  StartPhoneVerificationResult,
  VerifyEmailResult,
} from '@/modules/iam/application/auth-service'
import type * as Dto from '@/modules/iam/application/dto'
import type { DomainError, Result } from '@/shared/result'

/**
 * Server actions — the **second** adapter over the same services
 * (`05-system-architecture.md` §Two entry points).
 *
 * They live in `app/` because that is what they are: an adapter, alongside the route
 * handlers, outside the module. `05` §ActorContext defines `application/` as
 * framework-agnostic — "callable from jobs and tests" — and `'use server'` plus
 * `next/headers` is neither.
 *
 * **Every service is reached through `await import()` inside the function body.** That is
 * not ceremony. A page imports this file statically, so anything imported at *module scope*
 * here lands in the page's build-time module graph, and `auth-service` reaches `env` and the
 * Prisma client (`CLAUDE.md` non-negotiable 9). Moving the file into `app/` did not by
 * itself fix that — what keeps the build secret-free is laziness deep in the chain, and
 * `test/fixtures/boundary/app-action-{static,dynamic}-import.ts` are the two fixtures that
 * prove the difference.
 *
 * The imports above are `import type`, which is erased.
 */

async function actorFromHeaders() {
  const [{ headers }, { resolveActor }] = await Promise.all([
    import('next/headers'),
    import('@/shared/context/actor'),
  ])
  const requestHeaders = await headers()

  return resolveActor({ headers: { get: (name: string) => requestHeaders.get(name) } })
}

/**
 * Parse with the use case's schema, then run it.
 *
 * The schema is the *same object* the route handler parses with (`CLAUDE.md` §Conventions);
 * it is named rather than passed so this file never imports `dto` at module scope either.
 */
async function run<K extends keyof typeof Dto, T>(
  schema: K,
  call: (
    actor: Awaited<ReturnType<typeof actorFromHeaders>>,
    input: never,
  ) => Promise<Result<T, DomainError>>,
  input: unknown,
): Promise<ActionResult<T>> {
  const [dto, { err, validation }] = await Promise.all([
    import('@/modules/iam/application/dto'),
    import('@/shared/result'),
  ])

  const parsed = (dto[schema] as { safeParse: (value: unknown) => unknown }).safeParse(input) as
    | { success: true; data: unknown }
    | { success: false; error: { issues: Parameters<typeof validation>[0] } }

  if (!parsed.success) return actionResult(err(validation(parsed.error.issues)))

  return actionResult(await call(await actorFromHeaders(), parsed.data as never))
}

export async function registerAction(input: unknown): Promise<ActionResult<RegisterResult>> {
  return run(
    'registerSchema',
    async (actor, data) =>
      (await import('@/modules/iam/application/auth-service')).register(actor, data),
    input,
  )
}

/**
 * Sign in, and **open a browser session** — `ADR-022`.
 *
 * The cookie is written here rather than in the service because only a server action or a
 * route handler may set one, and because `05` §Shape keeps services free of transport
 * concerns: `login` decides whether the credentials are good, this decides what the browser
 * is handed.
 *
 * Until Phase 4 this action returned tokens and the form threw them away, so signing in did
 * nothing at all (Q23). The tokens are still returned — `/api/v1` and any future mobile
 * client want them — but the browser now also leaves with a session.
 */
export async function loginAction(input: unknown): Promise<ActionResult<AuthTokens>> {
  const outcome = await run(
    'loginSchema',
    async (actor, data) =>
      (await import('@/modules/iam/application/auth-service')).login(actor, data),
    input,
  )

  if ('data' in outcome) {
    const [{ cookies }, { env }] = await Promise.all([
      import('next/headers'),
      import('@/shared/config/env'),
    ])

    const { webSession } = outcome.data as unknown as LoginResult
    const secure = env.APP_ENV !== 'local'

    const jar = await cookies()
    jar.set(secure ? SESSION_COOKIE : SESSION_COOKIE_DEV, webSession.token, {
      httpOnly: true,
      // Lax rather than Strict: the verification and reset links are top-level navigations
      // from a mail client, and Strict would drop the session on arrival — signing the user
      // out at the exact moment they followed our own link.
      sameSite: 'lax',
      secure,
      path: '/',
      expires: new Date(webSession.expires),
    })
  }

  return outcome
}

/**
 * The cookie names, duplicated here rather than imported.
 *
 * `app/` may not import a module's infrastructure, statically or dynamically — the layering
 * rule this file's own lint config enforces. Two short string constants are a smaller price
 * than an exemption, and `web-session.ts` carries the same pair with the reasoning.
 *
 * `__Host-` in production forbids a `Domain` attribute and requires `Secure` and `Path=/`, so
 * a subdomain cannot set or overwrite it. Local development is plain HTTP, where the prefix
 * would make the cookie unsettable.
 */
const SESSION_COOKIE = '__Host-pergola.session'
const SESSION_COOKIE_DEV = 'pergola.session'

/**
 * Sign out — delete the row, then clear the cookie.
 *
 * That order matters. Clearing the cookie first would leave a live session row addressable by
 * anyone who copied the value, and "sign out" would mean "forget locally".
 */
export async function logoutAction(): Promise<ActionResult<{ signedOut: true }>> {
  const [{ cookies }, { env }, { ok }] = await Promise.all([
    import('next/headers'),
    import('@/shared/config/env'),
    import('@/shared/result'),
  ])

  const secure = env.APP_ENV !== 'local'
  const name = secure ? SESSION_COOKIE : SESSION_COOKIE_DEV

  const jar = await cookies()
  const token = jar.get(name)?.value

  if (token !== undefined) {
    // Through the application service, not the infrastructure — the row is closed by the
    // module that owns it, and this action only manages the cookie.
    const { endWebSession } = await import('@/modules/iam/application/auth-service')
    await endWebSession(await actorFromHeaders(), { sessionToken: token })
  }

  jar.delete(name)

  return actionResult(ok({ signedOut: true as const }))
}

export async function requestPasswordResetAction(
  input: unknown,
): Promise<ActionResult<RequestPasswordResetResult>> {
  return run(
    'requestPasswordResetSchema',
    async (actor, data) =>
      (await import('@/modules/iam/application/auth-service')).requestPasswordReset(actor, data),
    input,
  )
}

export async function resetPasswordAction(
  input: unknown,
): Promise<ActionResult<ResetPasswordResult>> {
  return run(
    'resetPasswordSchema',
    async (actor, data) =>
      (await import('@/modules/iam/application/auth-service')).resetPassword(actor, data),
    input,
  )
}

export async function verifyEmailAction(input: unknown): Promise<ActionResult<VerifyEmailResult>> {
  return run(
    'verifyEmailSchema',
    async (actor, data) =>
      (await import('@/modules/iam/application/auth-service')).verifyEmail(actor, data),
    input,
  )
}

export async function resendEmailVerificationAction(
  input: unknown,
): Promise<ActionResult<RequestPasswordResetResult>> {
  return run(
    'resendEmailVerificationSchema',
    async (actor, data) =>
      (await import('@/modules/iam/application/auth-service')).resendEmailVerification(actor, data),
    input,
  )
}

export async function startPhoneVerificationAction(
  input: unknown,
): Promise<ActionResult<StartPhoneVerificationResult>> {
  return run(
    'startPhoneVerificationSchema',
    async (actor, data) =>
      (await import('@/modules/iam/application/auth-service')).startPhoneVerification(actor, data),
    input,
  )
}

export async function confirmPhoneVerificationAction(
  input: unknown,
): Promise<ActionResult<ConfirmPhoneVerificationResult>> {
  return run(
    'confirmPhoneVerificationSchema',
    async (actor, data) =>
      (await import('@/modules/iam/application/auth-service')).confirmPhoneVerification(
        actor,
        data,
      ),
    input,
  )
}

export async function listSessionsAction(
  input: unknown = {},
): Promise<ActionResult<ListSessionsResult>> {
  return run(
    'listSessionsSchema',
    async (actor, data) =>
      (await import('@/modules/iam/application/auth-service')).listSessions(actor, data),
    input,
  )
}

export async function revokeSessionAction(
  input: unknown,
): Promise<ActionResult<RevokeSessionResult>> {
  return run(
    'revokeSessionSchema',
    async (actor, data) =>
      (await import('@/modules/iam/application/auth-service')).revokeSession(actor, data),
    input,
  )
}
