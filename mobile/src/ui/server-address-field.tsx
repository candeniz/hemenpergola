import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { getBaseUrl, SERVER_OVERRIDE_ALLOWED, setServerAddress } from '../api/server-address'
import { clearTokens } from '../auth/token-store'
import { t, type Locale } from '../i18n'
import { colors } from '../theme'
import { Button, ErrorText, Field } from './primitives'

/**
 * The server address, as one component used everywhere it is needed (task 13.5).
 *
 * 13.4 put this field on the sign-in screen only, which is the one place it is useless when
 * it is most needed: a wrong address means the app never reaches sign-in — it sits on the
 * unreachable screen instead. It is now on that screen too, and in settings for someone
 * already signed in. Three call sites, ONE implementation, and `server-address.ts` stays
 * the only reader of the setting.
 *
 * ## Changing the address wipes the session
 *
 * Talking to server B with server A's tokens produces 401s and empty screens, which reads
 * as "the build is broken" rather than "you moved". So a successful change clears the
 * keystore and empties the Query cache before anything else runs — the cached lead list
 * from A must not be rendered under B. `onChanged` is where the caller re-derives.
 *
 * Renders nothing at all when the build profile does not allow the override, so a store
 * build cannot show it even by accident of routing (`ADR-033`).
 */
export function ServerAddressField({
  locale,
  onChanged,
}: {
  locale: Locale
  onChanged?: () => void
}) {
  const queryClient = useQueryClient()
  const [address, setAddress] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!SERVER_OVERRIDE_ALLOWED) return
    void getBaseUrl().then(setAddress)
  }, [])

  if (!SERVER_OVERRIDE_ALLOWED) return null

  const save = async () => {
    setBusy(true)
    const saved = await setServerAddress(address)

    if (saved === null) {
      setInvalid(true)
      setNote(t(locale, 'mobile.serverAddress.invalid'))
      setBusy(false)
      return
    }

    // Order matters: no request may go out carrying the old server's identity.
    await clearTokens()
    queryClient.clear()

    setInvalid(false)
    setNote(t(locale, 'mobile.serverAddress.saved', { address: saved }))
    setAddress(saved)
    setBusy(false)
    onChanged?.()
  }

  return (
    <View style={styles.box}>
      <Field
        label={t(locale, 'mobile.serverAddress.label')}
        placeholder={t(locale, 'mobile.serverAddress.placeholder')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        value={address}
        onChangeText={setAddress}
      />
      {invalid ? <ErrorText message={note} /> : null}
      {!invalid && note !== null ? <Text style={styles.note}>{note}</Text> : null}
      <Button
        label={t(locale, 'mobile.serverAddress.save')}
        kind="outline"
        busy={busy}
        onPress={() => void save()}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  box: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: 8,
  },
  note: { color: colors.muted },
})
