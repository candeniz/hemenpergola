import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { logout, NETWORK_ERROR, request } from '../mobile/src/api/client'
import { readTokens, writeTokens } from '../mobile/src/auth/token-store'
import { deriveSession } from '../mobile/src/state/session-machine'
import { __reset } from './stubs/expo-secure-store'

/**
 * Task 13.5 — **the leg that carries `ADR-033`'s decision, finally exercised.**
 *
 * 13.4 made the server address settable at runtime, which makes a *wrong* address a normal
 * state rather than an accident. Nothing tested what the app does in it, and the answer was
 * bad in three ways at once: `fetch` rejected instead of returning an `ApiResult`, the
 * session provider's boot `void refresh()` swallowed that rejection and left the app on the
 * `booting` spinner forever, and sign-out awaited a server it could not reach — so the one
 * button that could have rescued the tester did nothing.
 *
 * These are the two properties that keep it fixed. They run against a `fetch` that throws,
 * because that is precisely what an unreachable host does.
 *
 * Sibling of `mobile-server-override.test.ts`: root ESLint ignores `mobile/` and the mobile
 * package has no runner, so what can be checked from here is checked from here. Where that
 * file reads source text — the only way to assert the *absence* of a line in a JSON file —
 * this one runs the code, because these claims are about behaviour.
 */

const deadNetwork = () => {
  throw new TypeError('Network request failed')
}

beforeEach(() => {
  __reset()
  vi.stubGlobal('fetch', vi.fn(deadNetwork))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('13.5 · an unreachable server is a result, not a crash', () => {
  it('request() returns a NETWORK failure instead of rejecting', async () => {
    const result = await request('/companies')

    // The type has always promised `ApiResult`; before 13.5 the transport error broke that
    // promise and every caller inherited a rejected promise it had no catch for.
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe(NETWORK_ERROR)
  })

  it('a 200 that is not the envelope is also NETWORK — the captive-portal case', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>sign in to the wifi</html>', { status: 200 })),
    )

    const result = await request('/companies')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe(NETWORK_ERROR)
  })

  it('the session lands on `unreachable`, not on `booting` and not on the wall', async () => {
    await writeTokens('access-token', 'refresh-token')

    const session = await deriveSession()

    // Not `booting`: the provider sets whatever this returns, so a rejection here is what
    // used to freeze the app on the spinner.
    expect(session.state).toBe('unreachable')
    // And emphatically not `signed-out` — the tokens are fine, the address is not, and the
    // two states send the person to two different screens.
    expect(session.state).not.toBe('signed-out')
  })

  it('no token means the wall, even with a dead network — nothing to be unreachable about', async () => {
    const session = await deriveSession()
    expect(session.state).toBe('signed-out')
  })

  it('signOut clears the keystore even though the server cannot be told', async () => {
    await writeTokens('access-token', 'refresh-token')

    // Resolves rather than rejects: the local wipe is the sign-out, and it is the only
    // awaited step.
    await expect(logout()).resolves.toBeUndefined()

    expect(await readTokens()).toEqual({ access: null, refresh: null })
  })
})
