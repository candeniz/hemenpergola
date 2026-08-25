import { Redirect, Stack } from 'expo-router'

import { useSession } from '../../src/state/session'

/**
 * The customer shell's guard — the mobile analog of the web's `(customer)` route group
 * gate (`ADR-024`'s idea, `ADR-032`'s mechanism): a stranger or the wrong role meets a
 * redirect at the LAYOUT, so no screen below needs its own check.
 */
export default function MusteriLayout() {
  const { session } = useSession()

  if (session.state === 'booting') return null
  if (session.state === 'signed-out') return <Redirect href="/giris" />
  if (session.role !== 'customer') return <Redirect href="/" />

  return <Stack screenOptions={{ headerShown: true }} />
}
