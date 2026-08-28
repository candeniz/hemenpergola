import * as SecureStore from 'expo-secure-store'

/**
 * Where the app talks to — **the one door**, and in a test build a door that opens at
 * runtime (task 13.4).
 *
 * ## The problem this exists to solve
 *
 * `EXPO_PUBLIC_API_URL` is burned into the bundle at build time. 13.3's tunnel gives the
 * local server a fresh `https://<random>.trycloudflare.com` on every start, so with a
 * build-time-only address the whole test loop is:
 *
 *   start tunnel → wait for the EAS queue → wait for the build → install → test,
 *
 * with the tunnel obliged to stay alive across all of it, and the APK dead by the next
 * session. Ten to twenty minutes of build per round, and the address cannot be repaired
 * once it dies — which is exactly what `scripts/tunnel.mjs` now has to shout about.
 *
 * With this, the APK is built **once** and the address is typed in per session: one build,
 * ever, and a tunnel that only has to outlive the test itself.
 *
 * ## Why it is a profile flag and not `__DEV__`
 *
 * `__DEV__` is false in *any* release bundle, so a `preview` APK — which is a release
 * bundle — would have the field switched off, which is the one build that needs it.
 * Inverting the test (`!__DEV__`) would open it in production. Neither expresses the actual
 * rule, which is about the **profile**: `development` and `preview` may retarget, the store
 * build may not, ever.
 *
 * So the gate is `EXPO_PUBLIC_ALLOW_SERVER_OVERRIDE`, set in `mobile/eas.json` on those two
 * profiles and **absent from `production`**. `test/mobile-server-override.test.ts` asserts
 * that absence, because a flag whose off state nothing checks is a flag that turns itself
 * on during a merge.
 *
 * When the flag is off this module has no stored state at all: `getBaseUrl()` returns the
 * compiled-in default without so much as reading the keystore.
 */

const ADDRESS_KEY = 'hp.serverAddress'

/** Set by the build profile. Only `'1'` opens the door — anything else is closed. */
export const SERVER_OVERRIDE_ALLOWED = process.env.EXPO_PUBLIC_ALLOW_SERVER_OVERRIDE === '1'

/** What the build was compiled with; the fallback whenever nothing is stored. */
export const DEFAULT_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

/** `undefined` = not read yet, `null` = read and empty. Saves a keystore hit per request. */
let cached: string | null | undefined

/**
 * Accept only what can actually be an origin, and store only the origin.
 *
 * A pasted tunnel address arrives with a trailing slash, a stray space, or the whole
 * `https://x.trycloudflare.com/proje/yeni` someone copied out of a browser. `client.ts`
 * appends `/api/v1`, so anything past the origin would build a nonsense URL and fail as a
 * network error three screens later.
 */
export function normaliseServerAddress(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin
  } catch {
    return null
  }
}

export async function getBaseUrl(): Promise<string> {
  if (!SERVER_OVERRIDE_ALLOWED) return DEFAULT_BASE_URL
  if (cached === undefined) {
    try {
      cached = await SecureStore.getItemAsync(ADDRESS_KEY)
    } catch {
      // A keystore that will not read must not brick the app; the compiled-in default is
      // still a working answer for the development profile.
      cached = null
    }
  }
  return cached ?? DEFAULT_BASE_URL
}

/** Returns the stored origin, or `null` if the input was not usable (or the door is shut). */
export async function setServerAddress(raw: string): Promise<string | null> {
  if (!SERVER_OVERRIDE_ALLOWED) return null

  const origin = normaliseServerAddress(raw)
  if (origin === null) return null

  await SecureStore.setItemAsync(ADDRESS_KEY, origin)
  cached = origin
  return origin
}

/** Back to the compiled-in address. */
export async function clearServerAddress(): Promise<void> {
  if (!SERVER_OVERRIDE_ALLOWED) return
  await SecureStore.deleteItemAsync(ADDRESS_KEY)
  cached = null
}
