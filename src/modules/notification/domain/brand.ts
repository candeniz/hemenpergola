import trMessages from '@/i18n/messages/tr.json'

/**
 * The name to put in an email.
 *
 * Q1 is open — the product has no name yet — and the UI renders the literal placeholder
 * `{brand}` from the message catalogue. Mail reads the *same* entry rather than declaring a
 * second one, so when Q1 closes both change together and there is no second place to
 * forget.
 *
 * The stored value is ICU-escaped (`'{brand}'`) because bare braces are an ICU variable;
 * the quotes are stripped here since mail is not rendered through ICU.
 */
export function brandName(): string {
  return trMessages.brand.name.replace(/^'|'$/g, '')
}
