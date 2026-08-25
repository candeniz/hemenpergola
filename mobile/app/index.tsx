import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'

import { useSession } from '../src/state/session'
import { colors } from '../src/theme'

/**
 * The fork. `/` never renders a screen of its own — it reads the session and sends the
 * person to their shell, which is where the role split lives in the navigation itself
 * (`ADR-030`: one app, two roles, split at login; `ADR-032`: the split is two route
 * groups, not two conditionals inside shared screens).
 */
export default function Index() {
  const { session } = useSession()

  if (session.state === 'booting') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.page }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  if (session.state === 'signed-out') return <Redirect href="/giris" />
  return session.role === 'manufacturer' ? (
    <Redirect href="/(uretici)" />
  ) : (
    <Redirect href="/(musteri)" />
  )
}
