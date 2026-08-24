import trMessages from '@/i18n/messages/tr.json'

/**
 * The name to put in an email — **"Hemen Pergola"** since Q1 closed (2026-08-24).
 *
 * Mail reads the same `brand.name` catalogue entry the UI renders rather than declaring a
 * second constant, so a future rename changes one place. The strip below is a leftover
 * guard from the `'{brand}'` placeholder era (the value was ICU-escaped then); it is a
 * no-op on a real name and harmless to keep for a value that will never start with a
 * quote.
 *
 * The SMS sender ID is deliberately NOT this string: the GSM alphanumeric field is 11
 * characters and "Hemen Pergola" does not fit. That abbreviation is decided with the İYS
 * application (Q2/Q3), lives in configuration, and is not hardcoded anywhere here.
 */
export function brandName(): string {
  return trMessages.brand.name.replace(/^'|'$/g, '')
}
