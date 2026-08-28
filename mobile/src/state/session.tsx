import { createContext, useCallback, useContext, useEffect, useState } from 'react'

import { registerForPush, unregisterPush } from '../push/register'
import { deriveSession, localSignOut, type Session } from './session-machine'

/**
 * The app's whole auth state: booting → signed-out | unreachable | signed-in(role).
 *
 * The decision itself is `session-machine.ts`; this file is the React half — context, the
 * boot effect, and the push registration that needs a live session. The split is task
 * 13.5's: the decision has a right answer and is now tested without a renderer.
 *
 * It lives in context rather than in each route because the router groups' guards, the
 * login screen and the unreachable screen all consume the one answer, and two fetches of it
 * would be two chances to disagree during a navigation.
 */

export type { Session }

type SessionContextValue = {
  session: Session
  /** Re-derive from the server — after login, after an address change, or on retry. */
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>({ state: 'booting' })

  const refresh = useCallback(async () => {
    // `deriveSession` never rejects, which is what keeps the app off the `booting` spinner
    // when the server is unreachable — the failure it used to throw had no catch anywhere,
    // so the provider stayed in `booting` forever and the app looked frozen.
    const next = await deriveSession()
    setSession(next)

    // The device becomes an address for this account — best-effort, silent without
    // permission or credentials (see register.ts; Q32).
    if (next.state === 'signed-in') void registerForPush()
  }, [])

  const signOut = useCallback(async () => {
    // Local first, and the state flips on the local wipe alone: an unreachable server must
    // not be able to keep this device signed in (13.5).
    const access = await localSignOut()
    setSession({ state: 'signed-out' })

    // Told, not asked. Nothing below this line is awaited or can fail the sign-out.
    void unregisterPush(access ?? undefined)
  }, [])

  useEffect(() => {
    // Deferred a tick: the boot probe's first setState then happens outside the effect
    // body, which is both what the compiler lint asks for and honest about what this is —
    // a subscription to SecureStore + the API, not a synchronous derivation.
    const timer = setTimeout(() => {
      // `refresh` cannot reject, but the floor is here anyway: a `void` on a promise that
      // could reject is exactly the swallowed failure 13.5 came to remove.
      refresh().catch(() => setSession({ state: 'unreachable' }))
    }, 0)
    return () => clearTimeout(timer)
  }, [refresh])

  return (
    <SessionContext.Provider value={{ session, refresh, signOut }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (value === null) throw new Error('useSession outside SessionProvider')
  return value
}
