/**
 * The same server action, written the way `src/app/actions/auth.ts` is written — and this
 * one must produce **no** boundary errors.
 *
 * A fixture that only proves the rule fires proves half of it. A rule that also fires on the
 * correct shape is worse than no rule: it gets suppressed, and the suppression is what the
 * next person copies.
 *
 * Two allowances are exercised here on purpose:
 *
 *   `await import(...)` inside the function body — evaluated when the request runs, never
 *   while Next collects page data.
 *
 *   `import type` at the top — erased by the compiler, so it is in neither the module graph
 *   nor the bundle, and it keeps the action's signature honest instead of `Promise<unknown>`.
 *
 * `test/module-boundary.test.ts` lints this and expects zero errors.
 */
'use server'

import type { AuthTokens } from '@/modules/iam/application/auth-service'

export async function loginAction(input: unknown): Promise<AuthTokens | null> {
  const [{ login }, { loginSchema }] = await Promise.all([
    import('@/modules/iam/application/auth-service'),
    import('@/modules/iam/application/dto'),
  ])

  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) return null

  const result = await login({} as never, parsed.data)
  return result.ok ? result.value : null
}
