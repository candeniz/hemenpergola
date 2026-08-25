import { Link, Stack, useLocalSearchParams } from 'expo-router'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'

import { useRequests } from '../../../../src/api/hooks'
import { statusLabel } from '../../../../src/lib/status'
import { t } from '../../../../src/i18n'
import { colors } from '../../../../src/theme'
import { Badge, QueryStates } from '../../../../src/ui/primitives'

export default function ProjeTalepler() {
  const locale = 'tr'
  const { id } = useLocalSearchParams<{ id: string }>()
  const requests = useRequests(id)

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t(locale, 'mobile.requests.title') }} />
      <QueryStates
        locale={locale}
        query={requests}
        isEmpty={(data) => data.requests.length === 0}
        emptyText={t(locale, 'mobile.requests.empty')}
      >
        {(data) => (
          <FlatList
            data={data.requests}
            keyExtractor={(request) => request.offerRequestId}
            renderItem={({ item }) => (
              <Link href={`/(musteri)/talep/${item.offerRequestId}`} asChild>
                <Pressable accessibilityRole="button" style={styles.row}>
                  <Text style={styles.rowTitle}>{item.companyName}</Text>
                  <Badge label={statusLabel(locale, item.status)} />
                </Pressable>
              </Link>
            )}
          />
        )}
      </QueryStates>
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
})
