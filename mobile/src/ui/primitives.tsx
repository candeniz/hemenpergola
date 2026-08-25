import { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native'

import { t, type Locale } from '../i18n'
import { colors } from '../theme'

/**
 * The handful of primitives every screen shares. Deliberately small: this is not a design
 * system, it is the four-states rule (`CLAUDE.md` §Definition of done), the 44 px touch
 * target (`22` §Rule 4) and the token palette (`22`, parity-tested) made unavoidable —
 * a screen built from these cannot forget them.
 */

type QueryLike<T> = {
  isPending: boolean
  isError: boolean
  data: T | undefined
}

/**
 * Wraps a query into the four states. `empty` fires when the query succeeded and
 * `isEmpty(data)` says there is nothing to show — an empty inbox is not an error and not
 * a blank white screen. The unauthorized state is upstream: the route-group guards
 * redirect before any screen using this renders.
 */
export function QueryStates<T>({
  locale,
  query,
  isEmpty,
  emptyText,
  children,
}: {
  locale: Locale
  query: QueryLike<T>
  isEmpty?: (data: T) => boolean
  emptyText?: string
  children: (data: T) => ReactNode
}) {
  if (query.isPending) {
    return (
      <View style={styles.stateBox}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  if (query.isError || query.data === undefined) {
    return (
      <View style={styles.stateBox}>
        <Text accessibilityRole="alert" style={styles.stateText}>
          {t(locale, 'mobile.common.error')}
        </Text>
      </View>
    )
  }

  if (isEmpty?.(query.data) === true) {
    return (
      <View style={styles.stateBox}>
        <Text style={styles.stateText}>{emptyText ?? t(locale, 'mobile.common.empty')}</Text>
      </View>
    )
  }

  return <>{children(query.data)}</>
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled = false,
  busy = false,
}: {
  label: string
  onPress: () => void
  kind?: 'primary' | 'outline' | 'destructive'
  disabled?: boolean
  busy?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.button, buttonKinds[kind], (disabled || busy) && styles.buttonDisabled]}
      disabled={disabled || busy}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator color={kind === 'outline' ? colors.primary : colors.onPrimary} />
      ) : (
        <Text style={[styles.buttonLabel, kind === 'outline' && { color: colors.primary }]}>
          {label}
        </Text>
      )}
    </Pressable>
  )
}

export function Badge({ label }: { label: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeLabel}>{label}</Text>
    </View>
  )
}

export function Field({ label, ...input }: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.fieldInput} placeholderTextColor={colors.muted} {...input} />
    </View>
  )
}

export function ErrorText({ message }: { message: string | null }) {
  if (message === null) return null
  return (
    <Text accessibilityRole="alert" style={styles.errorText}>
      {message}
    </Text>
  )
}

const styles = StyleSheet.create({
  stateBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  stateText: { color: colors.muted, textAlign: 'center' },
  button: {
    minHeight: 44, // 22 §Rule 4 — the touch target, not the visual, is what must be 44.
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { color: colors.onPrimary, fontWeight: '600' },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.divider,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeLabel: { color: colors.text, fontSize: 12, fontWeight: '600' },
  field: { marginBottom: 12 },
  fieldLabel: { color: colors.muted, marginBottom: 4, fontSize: 13 },
  fieldInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.panel,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  errorText: { color: colors.destructive, marginVertical: 8 },
})

const buttonKinds = StyleSheet.create({
  primary: { backgroundColor: colors.primary },
  outline: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.primary },
  destructive: { backgroundColor: colors.destructive },
})
