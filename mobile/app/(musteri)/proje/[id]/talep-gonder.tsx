import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { CONTACT_SHARING_TEXT_VERSION } from '@legal/consent-version'

import { createOfferRequests } from '../../../../src/api/endpoints'
import { useCustomerAction } from '../../../../src/api/hooks'
import { t } from '../../../../src/i18n'
import { colors } from '../../../../src/theme'
import { Button, ErrorText } from '../../../../src/ui/primitives'

/**
 * Consent, then the fan-out (`11` row 1, `CLAUDE.md` non-negotiable 8).
 *
 * The consent TEXT is the shared catalogue's `consent.contactSharing.*` — the same words
 * the web renders — and the VERSION is `CONTACT_SHARING_TEXT_VERSION` via `@legal`, the
 * same constant the service validates against. A bundled copy of either would go stale the
 * day the web bumps them; importing both means a stale APP fails loudly instead: the
 * service answers 422 and the screen says "update the app", which is the same re-render
 * rule the web's stale-tab comment describes, translated to a client that ships.
 */
export default function TalepGonder() {
  const locale = 'tr'
  const router = useRouter()
  const { id, companyIds } = useLocalSearchParams<{ id: string; companyIds: string }>()
  const selected = (companyIds ?? '').split(',').filter((value) => value !== '')

  const action = useCustomerAction(id, null)
  const [accepted, setAccepted] = useState(false)
  const [state, setState] = useState<'idle' | 'sent' | 'stale' | 'failed'>('idle')

  const submit = () =>
    action.mutate(
      () =>
        createOfferRequests({
          projectId: id,
          companyIds: selected,
          consent: { accepted: true, textVersion: CONTACT_SHARING_TEXT_VERSION },
        }),
      {
        onSuccess: () => setState('sent'),
        onError: (error) =>
          // 422 on the consent shape = the repo moved past this bundle's version.
          setState(error.message === 'VALIDATION' ? 'stale' : 'failed'),
      },
    )

  if (state === 'sent') {
    return (
      <View style={styles.screenCentered}>
        <Stack.Screen options={{ title: t(locale, 'mobile.consentScreen.title') }} />
        <Text role="status" style={styles.body}>
          {t(locale, 'mobile.consentScreen.sent')}
        </Text>
        <Button
          label={t(locale, 'mobile.projects.requests')}
          onPress={() => router.replace(`/(musteri)/proje/${id}/talepler`)}
        />
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t(locale, 'mobile.consentScreen.title') }} />

      <Text style={styles.body}>{t(locale, 'consent.contactSharing.body')}</Text>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        style={styles.checkboxRow}
        onPress={() => setAccepted((current) => !current)}
      >
        <View style={[styles.checkbox, accepted && styles.checkboxOn]} />
        <Text style={styles.checkboxLabel}>{t(locale, 'consent.contactSharing.label')}</Text>
      </Pressable>

      <ErrorText
        message={
          state === 'stale'
            ? t(locale, 'mobile.consentScreen.staleVersion')
            : state === 'failed'
              ? t(locale, 'mobile.common.error')
              : null
        }
      />

      <Button
        label={t(locale, 'mobile.consentScreen.submit')}
        disabled={!accepted || selected.length === 0}
        busy={action.isPending}
        onPress={submit}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  screenCentered: {
    flex: 1,
    backgroundColor: colors.page,
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  content: { padding: 16, gap: 16 },
  body: { color: colors.text, lineHeight: 22 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 44 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.primary,
    marginTop: 2,
  },
  checkboxOn: { backgroundColor: colors.primary },
  checkboxLabel: { color: colors.text, flex: 1 },
})
