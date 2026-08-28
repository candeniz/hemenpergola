import { logout, myCompanies, NETWORK_ERROR } from '../api/client'
import { readTokens } from '../auth/token-store'

/**
 * The session's **decision**, separated from its React plumbing (task 13.5).
 *
 * `session.tsx` is the provider — context, effects, the push registration. What lives here
 * is the part with a right and a wrong answer, and it lives here because it can then be
 * tested without a renderer: this module imports no React and no React Native, so
 * `test/mobile-session-network.test.ts` can drive it against a `fetch` that throws.
 *
 * That test exists because 13.4 shipped the decision this file encodes — the address is
 * settable at runtime, so a wrong one is routine — and never exercised the leg that carries
 * it.
 */

export type Session =
  | { state: 'booting' }
  | { state: 'signed-out' }
  /**
   * The request never reached a server. **Not the same as signed-out**, and the difference
   * is the whole reason this state exists: signed-out means "sign in", unreachable means
   * "the address is wrong" — two different screens, and showing the first one for the
   * second sends a tester to re-type a password that was never the problem.
   */
  | { state: 'unreachable' }
  | {
      state: 'signed-in'
      role: 'customer' | 'manufacturer'
      companyId: string | null
      companyName: string | null
    }

/**
 * Re-derive the session from the keystore and the server. **Never rejects** — every
 * outcome, including a dead network, is one of the four states above.
 *
 * The role comes from `GET /companies` (`ADR-030`: a membership opens the manufacturer
 * shell, none opens the customer shell) — the same derivation the web's shells make
 * through `resolveActor`.
 */
export async function deriveSession(): Promise<Session> {
  let token: string | null
  try {
    token = (await readTokens()).refresh
  } catch {
    // The keystore itself failed. Nothing can prove a session, so the safe answer is the
    // wall — not `unreachable`, which would offer to fix an address that is not the fault.
    return { state: 'signed-out' }
  }

  if (token === null) return { state: 'signed-out' }

  const companies = await myCompanies()
  if (!companies.ok) {
    // A dead token family lands on the wall via the client's failed refresh. A dead
    // *network* must not: the tokens may be perfectly good and the address simply wrong.
    return companies.code === NETWORK_ERROR ? { state: 'unreachable' } : { state: 'signed-out' }
  }

  const [first] = companies.data.companies
  return first === undefined
    ? { state: 'signed-in', role: 'customer', companyId: null, companyName: null }
    : {
        state: 'signed-in',
        role: 'manufacturer',
        companyId: first.companyId,
        companyName: first.displayName,
      }
}

/**
 * The local half of signing out, and the half that decides the answer: `logout()` clears
 * the keystore first and tells the server in the background. Returns the access token it
 * captured so the caller can hand it to `unregisterPush` — the store is empty by then.
 */
export async function localSignOut(): Promise<string | null> {
  let access: string | null = null
  try {
    access = (await readTokens()).access
  } catch {
    // A keystore that will not read must not block a sign-out; the wipe below still runs.
  }
  await logout()
  return access
}
