import { Link, Stack } from 'expo-router'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'

import { useProjects } from '../../src/api/hooks'
import { statusLabel } from '../../src/lib/status'
import { t } from '../../src/i18n'
import { useSession } from '../../src/state/session'
import { colors } from '../../src/theme'
import { Badge, Button, QueryStates } from '../../src/ui/primitives'

/**
 * The customer home — their projects (`10`), each opening its hub. Creating a project
 * stays on the web (`ADR-030`: the wizard is not phone scope in this phase), which is what
 * the empty state says instead of pretending a button exists.
 */
export default function MusteriProjects() {
  const locale = 'tr'
  const { signOut } = useSession()
  const projects = useProjects()

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t(locale, 'mobile.projects.title') }} />
      <QueryStates
        locale={locale}
        query={projects}
        isEmpty={(data) => data.projects.length === 0}
        emptyText={t(locale, 'mobile.projects.empty')}
      >
        {(data) => (
          <FlatList
            data={data.projects}
            keyExtractor={(project) => project.projectId}
            renderItem={({ item }) => (
              <Link href={`/(musteri)/proje/${item.projectId}`} asChild>
                <Pressable accessibilityRole="button" style={styles.row}>
                  <Text style={styles.rowTitle}>
                    {item.title ??
                      (item.areaM2 === null
                        ? item.projectId.slice(0, 8)
                        : t(locale, 'mobile.leads.area', { area: item.areaM2 }))}
                  </Text>
                  <Badge label={statusLabel(locale, item.status)} />
                </Pressable>
              </Link>
            )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowTitle: { color: colors.text, fontWeight: '600' },
  footer: { padding: 16, gap: 8 },
  footerLink: { minHeight: 44, justifyContent: 'center' },
  footerLinkText: { color: colors.primary, fontWeight: '600' },
})
