import { createContext, useCallback, useContext, useEffect, useState } from 'react'

import { logout, myCompanies } from '../api/client'
import { registerForPush, unregisterPush } from '../push/register'
import { readTokens } from '../auth/token-store'

/**
 * The app's whole auth state: booting → signed-out → signed-in(role).
 *
 * The role comes from `GET /companies` (`ADR-030`: a membership opens the manufacturer
 * shell, none opens the customer shell) — the same derivation the web's shells make
 * through `resolveActor`. It lives in context rather than in each route because the router
 * groups' guards and the login screen all consume the one answer, and two fetches of it
 * would be two chances to disagree during a navigation.
 */

export type Session =
  | { state: 'booting' }
  | { state: 'signed-out' }
  | {
      state: 'signed-in'
      role: 'customer' | 'manufacturer'
      companyId: string | null
      companyName: string | null
    }

type SessionContextValue = {
  session: Session
  /** Re-derive from the server — after login, or when a 401 killed the family. */
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>({ state: 'booting' })

  const refresh = useCallback(async () => {
    const { refresh: token } = await readTokens()
    if (token === null) {
      setSession({ state: 'signed-out' })
      return
    }

    const companies = await myCompanies()
    if (!companies.ok) {
      // A dead token family lands here via the client's failed refresh; the wall is next.
      setSession({ state: 'signed-out' })
      return
    }

    // The device becomes an address for this account — best-effort, silent without
    // permission or credentials (see register.ts; Q32).
    void registerForPush()

    const [first] = companies.data.companies
    setSession(
      first === undefined
        ? { state: 'signed-in', role: 'customer', companyId: null, companyName: null }
        : {
            state: 'signed-in',
            role: 'manufacturer',
            companyId: first.companyId,
            companyName: first.displayName,
          },
    )
  }, [])

  const signOut = useCallback(async () => {
    await unregisterPush()
    await logout()
    setSession({ state: 'signed-out' })
  }, [])

  useEffect(() => {
    // Deferred a tick: the boot probe's first setState then happens outside the effect
    // body, which is both what the compiler lint asks for and honest about what this is —
    // a subscription to SecureStore + the API, not a synchronous derivation.
    const timer = setTimeout(() => void refresh(), 0)
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
