import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { login } from '../api/client'
import { t, type Locale } from '../i18n'
import { colors } from '../theme'
import { ServerAddressField } from '../ui/server-address-field'

/**
 * The proof-of-life screen, not the shipped one: its job is to demonstrate that the token
 * flow, the shared contract schema, SecureStore and the shared catalogues actually work
 * end to end. Visual design arrives with the real screens (`ADR-030` scope).
 *
 * It also carries the **server address** field (task 13.4), and it carries it here for a
 * reason: the address has to be settable *before* the first request, and the first request
 * is the sign-in. 13.5 moved the field itself into `ui/server-address-field.tsx`, because
 * this is not the only screen that needs it — a wrong address never reaches sign-in at all,
 * so `app/sunucu.tsx` carries the same component. The field renders only when the build
 * profile allows it; `server-address.ts` explains why that is a profile flag, not `__DEV__`.
 */
export function LoginScreen({ locale, onSignedIn }: { locale: Locale; onSignedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(null)
    const result = await login({ email, password })
    setBusy(false)

    if (!result.ok) {
      // Codes, never server messages — 06 §Envelope says clients switch on `code`.
      setError(
        result.code === 'RATE_LIMITED'
          ? t(locale, 'mobile.login.rateLimited')
          : t(locale, 'mobile.login.failed'),
      )
      return
    }
    onSignedIn()
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t(locale, 'mobile.login.title')}</Text>

      <TextInput
        style={styles.input}
        placeholder={t(locale, 'mobile.login.email')}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder={t(locale, 'mobile.login.password')}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error === null ? null : (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}

      <Pressable
        accessibilityRole="button"
        style={[styles.button, busy && styles.buttonDisabled]}
        disabled={busy}
        onPress={submit}
      >
        {busy ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.buttonLabel}>{t(locale, 'mobile.login.submit')}</Text>
        )}
      </Pressable>

      <ServerAddressField locale={locale} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.page },
  title: { fontSize: 24, fontWeight: '600', color: colors.text, marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.panel,
    color: colors.text,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  error: { color: colors.destructive, marginBottom: 12 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonLabel: { color: colors.onPrimary, fontWeight: '600' },
})
