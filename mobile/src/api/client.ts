import { loginSchema, type AuthTokens, type LoginInput, type MyCompany } from '@contracts/iam'

import { clearTokens, readTokens, writeTokens } from '../auth/token-store'

export type { AuthTokens, MyCompany }

/**
 * The `/api/v1` client — the fourth consumer of the contract, after the server action, the
 * route handler and the tests (`05` §Two entry points).
 *
 * **Requests and responses are imported, never retyped.** `loginSchema` here IS the schema
 * the route handler parses with, and `AuthTokens`/`MyCompany` are the very types the
 * services return — aliased out of `src/modules/iam/application/dto.ts` via
 * `contract-map.json`. The dto closure is runtime-pure by test (`dto-purity.test.ts`),
 * which is what makes this import legal in a React Native bundle; the local copies this
 * file carried for one turn are gone, and a field the server renames now breaks this
 * compile instead of a device at runtime.
 *
 * The envelope is `06` §Envelope; clients switch on `error.code`, never parse `message`.
 */

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

type ErrorBody = { error: { code: string; message: string; requestId: string } }

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string }

export async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; retryOn401?: boolean } = {},
): Promise<ApiResult<T>> {
  const { access } = await readTokens()

  const response = await fetch(`${BASE_URL}/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(access === null ? {} : { authorization: `Bearer ${access}` }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })

  // One refresh, one retry — a second 401 means the family is dead and the person signs
  // in again. Looping here would hammer the auth rate limit with a broken token.
  if (response.status === 401 && (init.retryOn401 ?? true)) {
    const refreshed = await tryRefresh()
    if (refreshed) return request<T>(path, { ...init, retryOn401: false })
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null
    return {
      ok: false,
      code: body?.error.code ?? `HTTP_${response.status}`,
      message: body?.error.message ?? response.statusText,
    }
  }

  const body = (await response.json()) as { data: T }
  return { ok: true, data: body.data }
}

async function tryRefresh(): Promise<boolean> {
  const { refresh } = await readTokens()
  if (refresh === null) return false

  const result = await request<AuthTokens>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: refresh },
    retryOn401: false,
  })
  if (!result.ok) {
    await clearTokens()
    return false
  }

  await writeTokens(result.data.accessToken, result.data.refreshToken)
  return true
}

export async function login(input: LoginInput): Promise<ApiResult<AuthTokens>> {
  // The same parse the server runs, run first on the device: a malformed input never
  // spends a network round trip or an auth rate-limit slot to be told so.
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: 'invalid input' }

  const result = await request<AuthTokens>('/auth/login', {
    method: 'POST',
    body: parsed.data,
    retryOn401: false,
  })
  if (result.ok) await writeTokens(result.data.accessToken, result.data.refreshToken)
  return result
}

/** The role split (`ADR-030`): memberships decide which shell the app opens into. */
export async function myCompanies(): Promise<ApiResult<{ companies: MyCompany[] }>> {
  return request('/companies')
}

export async function logout(): Promise<void> {
  const { refresh } = await readTokens()
  // Best-effort server-side revocation; the local wipe is what signs the device out.
  if (refresh !== null) {
    await request('/auth/logout', {
      method: 'POST',
      body: { refreshToken: refresh },
      retryOn401: false,
    })
  }
  await clearTokens()
}
