import { useQuery } from '@tanstack/react-query'
import { Redirect, Stack, useRouter } from 'expo-router'
import { FlatList, Pressable, StyleSheet, Text } from 'react-native'

import type { NotificationListItem } from '@contracts/notification'

import { request } from '../src/api/client'
import { formatWhen } from '../src/lib/format'
import { t } from '../src/i18n'
import { useSession } from '../src/state/session'
import { colors } from '../src/theme'
import { QueryStates } from '../src/ui/primitives'

/**
 * The in-app history (`13`; capability built in 12.2). Labels come from the same
 * `privacy.events.*` vocabulary the preference screens use. A tap re-derives the deep-link
 * path CLIENT-side from type+payload — the same mapping the worker stamps on pushes — so
 * the list and a push land on the same screen.
 */
export default function Bildirimler() {
  const locale = 'tr'
  const router = useRouter()
  const { session } = useSession()

  const inbox = useQuery({
    queryKey: ['inbox'],
    queryFn: async () => {
      const result = await request<{ notifications: NotificationListItem[] }>('/me/notifications')
      if (!result.ok) throw new Error(result.code)
      return result.data
    },
  })

  if (session.state === 'signed-out') return <Redirect href="/giris" />

  const shell =
    session.state === 'signed-in' && session.role === 'manufacturer' ? '(uretici)' : '(musteri)'

  return (
    <>
      <Stack.Screen options={{ title: t(locale, 'mobile.notifications.title') }} />
      <QueryStates
        locale={locale}
        query={inbox}
        isEmpty={(data) => data.notifications.length === 0}
        emptyText={t(locale, 'mobile.notifications.empty')}
      >
        {(data) => (
          <FlatList
            style={styles.list}
            data={data.notifications}
            keyExtractor={(notification) => notification.id}
            renderItem={({ item }) => {
              const offerRequestId =
                typeof item.payload.offerRequestId === 'string' ? item.payload.offerRequestId : null
              return (
                <Pressable
                  accessibilityRole="button"
                  style={styles.row}
                  onPress={() => {
                    if (offerRequestId !== null) {
                      router.push(
                        (item.type === 'message_received'
                          ? `/${shell}/talep/${offerRequestId}/mesajlar`
                          : `/${shell}/talep/${offerRequestId}`) as never,
                      )
                    }
                  }}
                >
                  <Text style={styles.title}>{t(locale, `privacy.events.${item.type}`)}</Text>
                  <Text style={styles.when}>{formatWhen(item.createdAt)}</Text>
                </Pressable>
              )
            }}
          />
        )}
      </QueryStates>
    </>
  )
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.page },
  row: {
    minHeight: 44,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    padding: 16,
    gap: 4,
  },
  title: { color: colors.text },
  when: { color: colors.muted, fontSize: 12 },
})
