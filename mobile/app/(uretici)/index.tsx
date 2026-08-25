import { Link, Stack } from 'expo-router'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'

import { useLeads } from '../../src/api/hooks'
import { hoursLeft } from '../../src/lib/format'
import { t } from '../../src/i18n'
import { useSession } from '../../src/state/session'
import { colors } from '../../src/theme'
import { Badge, Button, QueryStates } from '../../src/ui/primitives'
import { statusLabel } from '../../src/lib/status'

/**
 * The lead inbox — the screen `ADR-030` says the app exists for. The 48-hour SLA (`11`)
 * is rendered as hours remaining, because "respond within the SLA" is the promise this
 * list either keeps or breaks.
 */
export default function LeadInbox() {
  const locale = 'tr'
  const { session, signOut } = useSession()
  const companyId = session.state === 'signed-in' ? (session.companyId ?? '') : ''
  const leads = useLeads(companyId)

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t(locale, 'mobile.leads.title') }} />
      <QueryStates
        locale={locale}
        query={leads}
        isEmpty={(data) => data.leads.length === 0}
        emptyText={t(locale, 'mobile.leads.empty')}
      >
        {(data) => (
          <FlatList
            data={data.leads}
            keyExtractor={(lead) => lead.offerRequestId}
            renderItem={({ item }) => {
              const hours = hoursLeft(item.slaExpiresAt)
              return (
                <Link href={`/(uretici)/talep/${item.offerRequestId}`} asChild>
                  <Pressable accessibilityRole="button" style={styles.row}>
                    <View style={styles.rowTop}>
                      <Badge label={statusLabel(locale, item.status)} />
                      {item.status === 'PENDING' ? (
                        <Text style={hours < 0 ? styles.slaDead : styles.sla}>
                          {hours < 0
                            ? t(locale, 'mobile.leads.slaExpired')
                            : t(locale, 'mobile.leads.slaHours', { hours })}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.rowText}>
                      {[
                        item.cityName,
                        item.districtName,
                        item.areaM2 === null
                          ? null
                          : t(locale, 'mobile.leads.area', { area: item.areaM2 }),
                      ]
                        .filter((part) => part !== null)
                        .join(' · ')}
                    </Text>
                  </Pressable>
                </Link>
              )
            }}
          />
        )}
      </QueryStates>
      <View style={styles.footer}>
        <Link href="/ayarlar/bildirimler" asChild>
          <Pressable accessibilityRole="button" style={styles.footerLink}>
            <Text style={styles.footerLinkText}>{t(locale, 'mobile.common.settings')}</Text>
          </Pressable>
        </Link>
        <Button
          kind="outline"
          label={t(locale, 'mobile.home.signOut')}
          onPress={() => void signOut()}
        />
      </View>
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
    gap: 6,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowText: { color: colors.text },
  sla: { color: colors.muted, fontSize: 13 },
  slaDead: { color: colors.destructive, fontSize: 13, fontWeight: '600' },
  footer: { padding: 16, gap: 8 },
  footerLink: { minHeight: 44, justifyContent: 'center' },
  footerLinkText: { color: colors.primary, fontWeight: '600' },
})
