'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

import type { ThreadView } from '@/modules/messaging/application/message-service'
import type { DomainError, Result } from '@/shared/result'

/**
 * Messaging server actions — task 7.1 second half. Same construction as `offer.ts`:
 * `await import()` for every value (`CLAUDE.md` non-negotiable 9), the service's own Zod
 * schemas, no scoping here — the ACCEPTED-only rule and ownership are the service's
 * (`ADR-028`).
 */

async function actor(companyId?: string) {
  const [{ headers }, { resolveActor }] = await Promise.all([
    import('next/headers'),
    import('@/shared/context/actor'),
  ])
  const requestHeaders = await headers()

  return resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    companyId === undefined ? {} : { companyId },
  )
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

  const companyId =
    typeof input === 'object' && input !== null && 'companyId' in input
      ? (input as { companyId?: unknown }).companyId
      : undefined

  return actionResult(
    await call(
      await actor(typeof companyId === 'string' ? companyId : undefined),
      parsed.data as never,
    ),
  )
}

const messaging = () => import('@/modules/messaging/application/message-service')

export async function sendMessageAsCustomerAction(
  input: unknown,
): Promise<ActionResult<{ messageId: string; sentAt: Date }>> {
  const service = await messaging()
  return run(service.sendMessageSchema, (a, d) => service.sendMessageAsCustomer(a, d), input)
}

export async function listThreadAsCustomerAction(
  input: unknown,
): Promise<ActionResult<ThreadView>> {
  const service = await messaging()
  return run(service.listThreadSchema, (a, d) => service.listThreadAsCustomer(a, d), input)
}

export async function sendMessageAsCompanyAction(
  input: unknown,
): Promise<ActionResult<{ messageId: string; sentAt: Date }>> {
  const service = await messaging()
  return run(service.sendMessageSchema, (a, d) => service.sendMessageAsCompany(a, d), input)
}

export async function listThreadAsCompanyAction(input: unknown): Promise<ActionResult<ThreadView>> {
  const service = await messaging()
  return run(service.listThreadSchema, (a, d) => service.listThreadAsCompany(a, d), input)
}
