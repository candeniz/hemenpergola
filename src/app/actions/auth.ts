'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

import type {
  AuthTokens,
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

export async function loginAction(input: unknown): Promise<ActionResult<AuthTokens>> {
  return run(
    'loginSchema',
    async (actor, data) =>
      (await import('@/modules/iam/application/auth-service')).login(actor, data),
    input,
  )
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
