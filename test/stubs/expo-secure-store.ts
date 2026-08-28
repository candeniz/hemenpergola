/**
 * An in-memory stand-in for `expo-secure-store` under Vitest.
 *
 * The real package is a React Native module over Keychain/Keystore: importing it in plain
 * Node reaches for a native module that is not there. The mobile code under test
 * (`token-store.ts`, `server-address.ts`) uses exactly three of its calls, and what those
 * calls must guarantee for `test/mobile-session-network.test.ts` is only that a write is
 * readable and a delete is not — which a Map provides exactly.
 *
 * This weakens nothing the tests here claim. That the platform keystore is the right STORE
 * is `12`'s decision, argued in `token-store.ts`; what these tests assert is the ORDER of
 * operations around it — that sign-out wipes locally before it talks to a server it may not
 * reach.
 */
const store = new Map<string, string>()

export async function getItemAsync(key: string): Promise<string | null> {
  return store.get(key) ?? null
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value)
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key)
}

/** Test-only: start each case from an empty keystore. */
export function __reset(): void {
  store.clear()
}
