'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

import type { DataExportReceipt } from '@/modules/privacy/application/privacy-service'
import type { NotificationPreferenceView } from '@/modules/notification/application/preference-service'
import type { DomainError, Result } from '@/shared/result'

/**
 * The account's own controls over its own data — task 10.2, `19` §Access and §Erasure.
 *
 * These five capabilities existed as services from Phase 7 and Phase 9 with an
 * authorisation entry and integration tests each, and **no surface of any kind**: no page,
 * no action, no route. The phase gate asked whether the service worked and it did; nothing
 * asked whether a person could reach it. That is the trap this file closes, and
 * `test/api-surface.test.ts` is what found it.
 *
 * Same construction as `messaging.ts`: `await import()` for every value (non-negotiable 9),
 * the services' own Zod schemas, and no scoping here — `customer-owned` and `authenticated`
 * are enforced in the services, whose `where` clauses are keyed by `actor.userId`.
 */

async function actor() {
  const [{ headers }, { resolveActor }] = await Promise.all([
    import('next/headers'),
    import('@/shared/context/actor'),
  ])
  const requestHeaders = await headers()

  return resolveActor({ headers: { get: (name: string) => requestHeaders.get(name) } })
}

async function run<T>(
  schema: { safeParse: (value: unknown) => unknown },
  call: (
    caller: Awaited<ReturnType<typeof actor>>,
    input: never,
  ) => Promise<Result<T, DomainError>>,
  input: unknown,
): Promise<ActionResult<T>> {
  const { err, validation } = await import('@/shared/result')

  const parsed = schema.safeParse(input) as
    | { success: true; data: unknown }
    | { success: false; error: { issues: Parameters<typeof validation>[0] } }

  if (!parsed.success) return actionResult(err(validation(parsed.error.issues)))

  return actionResult(await call(await actor(), parsed.data as never))
}

const privacy = () => import('@/modules/privacy/application/privacy-service')
const preferences = () => import('@/modules/notification/application/preference-service')

/** Ask for the export package. The subject is always the caller — there is no id to pass. */
export async function requestDataExportAction(
  input: unknown,
): Promise<ActionResult<DataExportReceipt>> {
  const service = await privacy()
  return run(service.requestDataExportSchema, (a, d) => service.requestDataExport(a, d), input)
}

/**
 * Ask to erase — which starts the verification loop, not the anonymisation (Q30).
 *
 * `confirmEmail` is a deliberate speed bump the service checks; the thing that authorises
 * the erasure is the emailed single-use token, confirmed by the action below. `19`'s
 * "request → verification → anonymisation" — this is the first word.
 */
export async function requestAccountErasureAction(
  input: unknown,
): Promise<ActionResult<{ expiresAt: Date }>> {
  const service = await privacy()
  return run(
    service.requestAccountErasureSchema,
    (a, d) => service.requestAccountErasure(a, d),
    input,
  )
}

/** The second word: the emailed token comes back and the anonymisation runs (`ADR-011`). */
export async function confirmAccountErasureAction(
  input: unknown,
): Promise<ActionResult<{ anonymisedEmail: string }>> {
  const service = await privacy()
  return run(
    service.confirmAccountErasureSchema,
    (a, d) => service.confirmAccountErasure(a, d),
    input,
  )
}

export async function listNotificationPreferencesAction(): Promise<
  ActionResult<NotificationPreferenceView[]>
> {
  const service = await preferences()
  const { z } = await import('zod')
  return run(z.object({}), (a, d) => service.listNotificationPreferences(a, d), {})
}

export async function setNotificationPreferenceAction(
  input: unknown,
): Promise<ActionResult<NotificationPreferenceView>> {
  const service = await preferences()
  return run(
    service.setNotificationPreferenceSchema,
    (a, d) => service.setNotificationPreference(a, d),
    input,
  )
}
