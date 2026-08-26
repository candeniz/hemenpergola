import { Redirect, Stack } from 'expo-router'
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native'

import { isMandatory, PREFERENCE_EVENT_TYPES } from '@contracts/notification'

import { usePreferences, useSetPreference } from '../../src/api/hooks'
import { t } from '../../src/i18n'
import { useSession } from '../../src/state/session'
import { colors } from '../../src/theme'
import { QueryStates } from '../../src/ui/primitives'

/**
 * Notification preferences — `13` §Preferences, both roles, one screen (preferences are
 * account-level, not shell-level, so it sits outside the role groups with its own guard).
 *
 * The catalogue is the spine and the stored rows are the exceptions over it — absence of a
 * row means enabled, the same derivation `/hesap/verilerim` makes, imported from the same
 * contract (`PREFERENCE_EVENT_TYPES`, `isMandatory`). Mandatory events (`ADR-027`) render
 * disabled-and-on rather than hidden. Every toggle is the server's answer: the mutation
 * settles, the query refetches, the switch shows what the row now holds.
 */
export default function Bildirimler() {
  const locale = 'tr'
  const { session } = useSession()
  const preferences = usePreferences()
  const setPreference = useSetPreference()

  if (session.state === 'signed-out') return <Redirect href="/giris" />

  return (
    <ScrollView style={styles.screen}>
      <Stack.Screen options={{ title: t(locale, 'mobile.prefs.title') }} />
      <QueryStates locale={locale} query={preferences}>
        {(rows) => {
          const off = new Set(
            rows.filter((row) => !row.enabled).map((row) => `${row.channel}:${row.type}`),
          )

          return (
            <View style={styles.list}>
              {PREFERENCE_EVENT_TYPES.map((type) => {
                const mandatory = isMandatory(type)
                return (
                  <View key={type} style={styles.row}>
                    <View style={styles.rowHead}>
                      <Text style={styles.rowTitle}>{t(locale, `privacy.events.${type}`)}</Text>
                      {mandatory ? (
                        <Text style={styles.mandatory}>{t(locale, 'mobile.prefs.mandatory')}</Text>
                      ) : null}
                    </View>
                    {(['email', 'sms', 'push'] as const).map((channel) => (
                      <View key={channel} style={styles.toggleRow}>
                        <Text style={styles.channel}>{t(locale, `mobile.prefs.${channel}`)}</Text>
                        <Switch
                          value={!off.has(`${channel}:${type}`)}
                          disabled={mandatory || setPreference.isPending}
                          trackColor={{ true: colors.confirm, false: colors.divider }}
                          onValueChange={(enabled) =>
                            setPreference.mutate({ channel, type, enabled })
                          }
                        />
                      </View>
                    ))}
                  </View>
                )
              })}
            </View>
          )
        }}
      </QueryStates>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  list: { padding: 12, gap: 8 },
  row: {
    backgroundColor: colors.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: 12,
    gap: 6,
  },
  rowHead: { gap: 2 },
  rowTitle: { color: colors.text, fontWeight: '600' },
  mandatory: { color: colors.muted, fontSize: 12 },
  toggleRow: {
    minHeight: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  channel: { color: colors.text },
})
