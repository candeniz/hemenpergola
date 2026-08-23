'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

import type { MatchRunView } from '@/modules/matching/application/match-service'
import type { DomainError, Result } from '@/shared/result'

/**
 * The matching surface's server actions — tasks 5.6–5.8.
 *
 * Same construction as `project.ts`: `await import()` for every value so nothing reaches
 * the build-time module graph (`CLAUDE.md` non-negotiable 9), and the same Zod schemas the
 * services parse with. Authorisation is the project's ownership, in the service's `where`
 * clause — nothing here scopes anything.
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

const matching = () => import('@/modules/matching/application/match-service')

/** The explicit re-run — `09` §Pipeline's "the customer explicitly re-runs". */
export async function runMatchAction(input: unknown): Promise<ActionResult<MatchRunView>> {
  const service = await matching()
  return run(service.runMatchSchema, (a, d) => service.runMatch(a, d), input)
}

/** `09` §Zero-result handling step 3 — the notify-me subscription. */
export async function watchSupplyGapAction(
  input: unknown,
): Promise<ActionResult<{ watching: true }>> {
  const service = await matching()
  return run(service.watchSupplyGapSchema, (a, d) => service.watchSupplyGap(a, d), input)
}
