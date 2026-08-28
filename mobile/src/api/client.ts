import { loginSchema, type AuthTokens, type LoginInput, type MyCompany } from '@contracts/iam'

import { clearTokens, readTokens, writeTokens } from '../auth/token-store'
import { getBaseUrl } from './server-address'

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
 *
 * The base address is NOT read from `process.env` here any more — `server-address.ts` is
 * the single door, because a `preview` build lets the person retarget it at runtime
 * (task 13.4) and two readers of the same setting is how one of them goes stale.
 */

type ErrorBody = { error: { code: string; message: string; requestId: string } }

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string }

/**
 * The code for "the request never reached a server" — a wrong address, a dead tunnel, a
 * phone with no signal (task 13.5).
 *
 * `06` §Envelope says clients switch on `error.code`, and until now the one failure the
 * mobile app is *most* likely to meet had no code at all: `fetch` rejects on a transport
 * error, so every caller of `request()` got a rejected promise instead of the `ApiResult`
 * its type promised. `ADR-033` made the server address settable at runtime, which makes an
 * unreachable host a NORMAL state rather than a bug — and a normal state has to be a value,
 * not an exception.
 *
 * Deliberately distinct from an HTTP failure: `session-machine.ts` shows "check the
 * address" for this and "sign in" for a 401, and those are different screens.
 */
export const NETWORK_ERROR = 'NETWORK'

export async function request<T>(
  path: string,
  init: {
    method?: string
    body?: unknown
    retryOn401?: boolean
    /**
     * Sign this one request with a token passed in rather than the stored one. Used by the
     * sign-out leg, which wipes the keystore FIRST and then tells the server with what it
     * captured — see `logout`.
     */
    bearer?: string
  } = {},
): Promise<ApiResult<T>> {
  const [{ access }, baseUrl] = await Promise.all([readTokens(), getBaseUrl()])
  const bearer = init.bearer ?? access

  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/v1${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(bearer === null || bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    })
  } catch (error) {
    return {
      ok: false,
      code: NETWORK_ERROR,
      message: error instanceof Error ? error.message : 'network request failed',
    }
  }

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

  /*
   * A 200 whose body is not the envelope is the same class of failure as a dead socket:
   * something that is not this API answered. A captive-portal login page is the everyday
   * cause, and it used to reject here, three frames deep inside a screen.
   */
  try {
    const body = (await response.json()) as { data: T }
    return { ok: true, data: body.data }
  } catch (error) {
    return {
      ok: false,
      code: NETWORK_ERROR,
      message: error instanceof Error ? error.message : 'unreadable response body',
    }
  }
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

/**
 * Sign this device out. **The local wipe is the sign-out** — that sentence was already the
 * comment here, and the code did the opposite: it awaited the server first, so an
 * unreachable host left the person signed in with a button that appeared to do nothing
 * (task 13.5, and `ADR-033` made an unreachable host routine).
 *
 * Now the keystore is cleared first and is the only awaited step. The server is *told*, not
 * asked: the captured tokens are passed explicitly because the store is already empty by
 * then, and nothing waits for the answer. What a failed revocation costs is bounded — the
 * refresh token expires on `12`'s schedule either way.
 */
export async function logout(): Promise<void> {
  const { access, refresh } = await readTokens()

  await clearTokens()

  if (refresh === null) return
  void request('/auth/logout', {
    method: 'POST',
    body: { refreshToken: refresh },
    retryOn401: false,
    ...(access === null ? {} : { bearer: access }),
  })
}
