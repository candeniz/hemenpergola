import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'

import { logout, myCompanies } from './src/api/client'
import { readTokens } from './src/auth/token-store'
import { HomeScreen } from './src/screens/HomeScreen'
import { LoginScreen } from './src/screens/LoginScreen'
import { colors } from './src/theme'
import type { Locale } from './src/i18n'

/**
 * The skeleton's whole state machine: booting → signed-out → signed-in(role).
 *
 * No navigation library yet, on purpose — one screen either side of the auth wall does not
 * need a router, and choosing one is a decision the real screens should force, not the
 * skeleton. The role comes from `GET /companies` (`ADR-030`: a membership opens the
 * manufacturer shell, none opens the customer shell) — the same answer the web's shells
 * derive from `resolveActor`.
 */

type Session =
  | { state: 'booting' }
  | { state: 'signed-out' }
  | { state: 'signed-in'; role: 'customer' | 'manufacturer'; companyName: string | null }

export default function App() {
  const [locale] = useState<Locale>('tr')
  const [session, setSession] = useState<Session>({ state: 'booting' })

  const resolveRole = useCallback(async () => {
    const companies = await myCompanies()
    if (!companies.ok) {
      // A dead token family lands here via the client's failed refresh; the wall is next.
      setSession({ state: 'signed-out' })
      return
    }

    const [first] = companies.data.companies
    setSession(
      first === undefined
        ? { state: 'signed-in', role: 'customer', companyName: null }
        : { state: 'signed-in', role: 'manufacturer', companyName: first.displayName },
    )
  }, [])

  useEffect(() => {
    void (async () => {
      const { refresh } = await readTokens()
      if (refresh === null) {
        setSession({ state: 'signed-out' })
        return
      }
      await resolveRole()
    })()
  }, [resolveRole])

  if (session.state === 'booting') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.page }}>
        <ActivityIndicator color={colors.primary} />
        <StatusBar style="auto" />
      </View>
    )
  }

  if (session.state === 'signed-out') {
    return (
      <>
        <LoginScreen locale={locale} onSignedIn={() => void resolveRole()} />
        <StatusBar style="auto" />
      </>
    )
  }

  return (
    <>
      <HomeScreen
        locale={locale}
        role={session.role}
        companyName={session.companyName}
        onSignOut={() => {
          void logout().then(() => setSession({ state: 'signed-out' }))
        }}
      />
      <StatusBar style="auto" />
    </>
  )
}
