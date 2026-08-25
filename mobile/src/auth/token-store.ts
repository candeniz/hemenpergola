import * as SecureStore from 'expo-secure-store'

/**
 * The Bearer pair, in the platform keystore — Keychain on iOS, Keystore on Android —
 * never `AsyncStorage`, which is a plaintext file any local backup or rooted device reads.
 *
 * The refresh token is the crown jewel: it is 30 days of account, and `12`'s family
 * rotation means a leaked one that gets used twice burns the whole family. The access
 * token could live in memory alone; it is stored too so that a cold start does not force a
 * refresh round trip before the first screen.
 */

const ACCESS_KEY = 'hp.accessToken'
const REFRESH_KEY = 'hp.refreshToken'

export async function readTokens(): Promise<{ access: string | null; refresh: string | null }> {
  const [access, refresh] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ])
  return { access, refresh }
}

export async function writeTokens(access: string, refresh: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, access),
    SecureStore.setItemAsync(REFRESH_KEY, refresh),
  ])
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ])
}
