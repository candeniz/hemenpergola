'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

import type { DomainError, Result } from '@/shared/result'

/** CMS server actions — task 8.3. Same construction as `offer.ts`. */

async function actor() {
  const [{ headers }, { resolveActor }] = await Promise.all([
    import('next/headers'),
    import('@/shared/context/actor'),
  ])
  const requestHeaders = await headers()
  return resolveActor({ headers: { get: (name: string) => requestHeaders.get(name) } }, {})
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

export async function upsertContentPageAction(
  input: unknown,
): Promise<ActionResult<{ key: string; locale: string }>> {
  const service = await import('@/modules/content/application/content-service')
  return run(service.upsertContentPageSchema, (a, d) => service.upsertContentPage(a, d), input)
}
