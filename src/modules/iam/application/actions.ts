'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'
import { err, validation } from '@/shared/result'

import { login, refresh, register } from './auth-service'
import { loginSchema, refreshSchema, registerSchema } from './dto'
import type { AuthTokens, RegisterResult } from './auth-service'

/**
 * Server actions — the **second** adapter over the same services
 * (`05-system-architecture.md` §Two entry points).
 *
 * Same Zod schemas as the route handlers, same services, same `Result` mapping. A feature
 * that works through an action but has no route-handler path is not done: the mobile phase
 * consumes `/api/v1`, and an API retrofitted afterwards is a rewrite.
 *
 * These live in `application/` rather than in `app/` because `app/` may not import the
 * services directly at module scope (non-negotiable 9) — the action file is inside the
 * module and the page imports the action.
 */

async function actorFromHeaders() {
  const { headers } = await import('next/headers')
  const { resolveActor } = await import('@/shared/context/actor')
  const requestHeaders = await headers()
  return resolveActor({ headers: { get: (name) => requestHeaders.get(name) } })
}

export async function loginAction(input: unknown): Promise<ActionResult<AuthTokens>> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) return actionResult(err(validation(parsed.error.issues)))

  return actionResult(await login(await actorFromHeaders(), parsed.data))
}

export async function registerAction(input: unknown): Promise<ActionResult<RegisterResult>> {
  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) return actionResult(err(validation(parsed.error.issues)))

  return actionResult(await register(await actorFromHeaders(), parsed.data))
}

export async function refreshAction(input: unknown): Promise<ActionResult<AuthTokens>> {
  const parsed = refreshSchema.safeParse(input)
  if (!parsed.success) return actionResult(err(validation(parsed.error.issues)))

  return actionResult(await refresh(await actorFromHeaders(), parsed.data))
}
