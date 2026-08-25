import { useState } from 'react'
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native'

import { useSendMessage, useThread } from '../api/hooks'
import { formatWhen } from '../lib/format'
import { t, type Locale } from '../i18n'
import { colors } from '../theme'
import { Button, QueryStates } from '../ui/primitives'

/**
 * The thread, both roles — one component because `15` §Rules are side-symmetric and the
 * only difference is which endpoint pair answers (the side picks the path; the SERVICE
 * picks the authorisation, which is why two paths exist at all).
 *
 * Polling per `ADR-009` rides `useThread`'s `refetchInterval`; `canSend` comes from the
 * server (`ADR-028`: no thread before acceptance — and after terminal states the box
 * closes rather than erroring on send).
 */
export function ThreadScreen({
  locale,
  offerRequestId,
  side,
  companyId,
}: {
  locale: Locale
  offerRequestId: string
  side: 'customer' | 'company'
  companyId: string | null
}) {
  const thread = useThread(offerRequestId, side, companyId)
  const send = useSendMessage(offerRequestId, side, companyId)
  const [body, setBody] = useState('')

  return (
    <View style={styles.screen}>
      <QueryStates locale={locale} query={thread}>
        {(view) => (
          <>
            {view.messages.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.muted}>{t(locale, 'mobile.messages.empty')}</Text>
              </View>
            ) : (
              <FlatList
                style={styles.list}
                contentContainerStyle={styles.listContent}
                data={view.messages}
                keyExtractor={(message) => message.id}
                renderItem={({ item }) => {
                  const mine = (side === 'customer') === (item.sender === 'customer')
                  return (
                    <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                      <Text style={mine ? styles.mineText : styles.theirsText}>{item.body}</Text>
                      <Text style={mine ? styles.mineWhen : styles.when}>
                        {formatWhen(item.sentAt)}
                      </Text>
                    </View>
                  )
                }}
              />
            )}

            {view.canSend ? (
              <View style={styles.composer}>
                <TextInput
                  style={styles.input}
                  placeholder={t(locale, 'mobile.messages.placeholder')}
                  placeholderTextColor={colors.muted}
                  value={body}
                  onChangeText={setBody}
                  multiline
                />
                <Button
                  label={t(locale, 'mobile.common.send')}
                  busy={send.isPending}
                  disabled={body.trim().length === 0}
                  onPress={() => send.mutate(body.trim(), { onSuccess: () => setBody('') })}
                />
              </View>
            ) : (
              <Text style={styles.closed}>{t(locale, 'mobile.messages.closed')}</Text>
            )}
          </>
        )}
      </QueryStates>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  list: { flex: 1 },
  listContent: { padding: 12, gap: 8 },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  bubble: { maxWidth: '80%', borderRadius: 10, padding: 10 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.panel },
  mineText: { color: colors.onPrimary },
  theirsText: { color: colors.text },
  when: { color: colors.muted, fontSize: 11, marginTop: 4 },
  mineWhen: { color: colors.onPrimary, fontSize: 11, marginTop: 4, opacity: 0.8 },
  muted: { color: colors.muted },
  closed: { color: colors.muted, textAlign: 'center', padding: 16 },
  composer: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.panel,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: colors.page,
  },
})
