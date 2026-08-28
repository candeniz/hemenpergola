import { Redirect, Stack, useRouter } from 'expo-router'
import { ScrollView, StyleSheet, Text } from 'react-native'

import { SERVER_OVERRIDE_ALLOWED } from '../src/api/server-address'
import { t } from '../src/i18n'
import { useSession } from '../src/state/session'
import { colors } from '../src/theme'
import { Button } from '../src/ui/primitives'
import { ServerAddressField } from '../src/ui/server-address-field'

/**
 * The screen for `unreachable` (task 13.5) — the one the app had no way to show.
 *
 * Before this, an unreachable server produced a `signed-out` verdict and the sign-in wall,
 * which asks the tester to re-type a password that was never the problem. `ADR-033` made a
 * wrong address routine, so it gets an honest screen: what happened, the field that fixes
 * it, and a retry.
 *
 * The field appears only on the profiles that allow the override; on a store build this
 * screen is a connection message and a retry, which is all a real user can act on.
 */
export default function Sunucu() {
  const locale = 'tr'
  const router = useRouter()
  const { session, refresh } = useSession()

  // Reachable again — by retry, or because a route sent us here after the state moved on.
  if (session.state !== 'unreachable' && session.state !== 'booting') {
    return <Redirect href="/" />
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Stack.Screen options={{ title: t(locale, 'mobile.unreachable.title') }} />

      <Text style={styles.heading}>{t(locale, 'mobile.unreachable.title')}</Text>
      <Text style={styles.body}>
        {t(
          locale,
          SERVER_OVERRIDE_ALLOWED ? 'mobile.unreachable.bodyTest' : 'mobile.unreachable.body',
        )}
      </Text>

      <Button
        label={t(locale, 'mobile.unreachable.retry')}
        onPress={() => void refresh().then(() => router.replace('/'))}
      />

      {/* Changing it clears the tokens and the Query cache — see the component. */}
      <ServerAddressField locale={locale} onChanged={() => void refresh()} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.page },
  heading: { fontSize: 22, fontWeight: '600', color: colors.text, marginBottom: 12 },
  body: { color: colors.muted, marginBottom: 24 },
})
