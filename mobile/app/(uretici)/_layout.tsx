import { Redirect, Stack } from 'expo-router'

import { useSession } from '../../src/state/session'

/** The manufacturer shell's guard — see the customer twin for the reasoning. */
export default function UreticiLayout() {
  const { session } = useSession()

  if (session.state === 'booting') return null
  if (session.state === 'unreachable') return <Redirect href="/sunucu" />
  if (session.state === 'signed-out') return <Redirect href="/giris" />
  if (session.role !== 'manufacturer') return <Redirect href="/" />

  return <Stack screenOptions={{ headerShown: true }} />
}
