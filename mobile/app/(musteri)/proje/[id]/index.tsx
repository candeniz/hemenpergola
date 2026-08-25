import { Link, Stack, useLocalSearchParams } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { t } from '../../../../src/i18n'
import { colors } from '../../../../src/theme'

/** The project hub: two doors — matches and requests. */
export default function ProjeHub() {
  const locale = 'tr'
  const { id } = useLocalSearchParams<{ id: string }>()

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t(locale, 'mobile.leads.project') }} />
      <Link href={`/(musteri)/proje/${id}/eslesmeler`} asChild>
        <Pressable accessibilityRole="button" style={styles.row}>
          <Text style={styles.rowText}>{t(locale, 'mobile.projects.matches')}</Text>
        </Pressable>
      </Link>
      <Link href={`/(musteri)/proje/${id}/talepler`} asChild>
        <Pressable accessibilityRole="button" style={styles.row}>
          <Text style={styles.rowText}>{t(locale, 'mobile.projects.requests')}</Text>
        </Pressable>
      </Link>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  row: {
    minHeight: 44,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    padding: 16,
    justifyContent: 'center',
  },
  rowText: { color: colors.text, fontWeight: '600' },
})
