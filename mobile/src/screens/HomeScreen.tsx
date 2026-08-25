import { Pressable, StyleSheet, Text, View } from 'react-native'

import { t, type Locale } from '../i18n'
import { colors } from '../theme'

/**
 * The empty shell after the role split (`ADR-030`: one app, two roles, split at login).
 * `role` is decided by `GET /companies` — a membership means the manufacturer shell, none
 * means the customer shell. Deliberately empty: the core-flow screens are the next slices.
 */
export function HomeScreen({
  locale,
  role,
  companyName,
  onSignOut,
}: {
  locale: Locale
  role: 'customer' | 'manufacturer'
  companyName: string | null
  onSignOut: () => void
}) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>
        {role === 'manufacturer'
          ? t(locale, 'mobile.home.manufacturerTitle', { company: companyName ?? '' })
          : t(locale, 'mobile.home.customerTitle')}
      </Text>
      <Text style={styles.body}>{t(locale, 'mobile.home.placeholder')}</Text>

      <Pressable accessibilityRole="button" style={styles.signOut} onPress={onSignOut}>
        <Text style={styles.signOutLabel}>{t(locale, 'mobile.home.signOut')}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.page },
  title: { fontSize: 22, fontWeight: '600', color: colors.text, marginBottom: 8 },
  body: { color: colors.muted, marginBottom: 32 },
  signOut: { alignSelf: 'flex-start', padding: 12 },
  signOutLabel: { color: colors.destructive, fontWeight: '600' },
})
