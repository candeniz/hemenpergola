import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { login } from '../api/client'
import { t, type Locale } from '../i18n'
import { colors } from '../theme'

/**
 * The proof-of-life screen, not the shipped one: its job is to demonstrate that the token
 * flow, the shared contract schema, SecureStore and the shared catalogues actually work
 * end to end. Visual design arrives with the real screens (`ADR-030` scope).
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
