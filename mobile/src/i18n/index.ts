import en from '@messages/en.json'
import tr from '@messages/tr.json'

/**
 * The same two catalogues next-intl serves on the web, imported rather than copied
 * (`I18N-01`). The resolver is deliberately tiny — dot-path lookup plus `{name}`
 * interpolation — because the skeleton needs strings, not a formatting engine; ICU
 * plurals arrive with the screens that need them.
 *
 * `test/mobile-i18n.test.ts` scans this package for `t('…')` keys and asserts each exists
 * in BOTH catalogues, which extends `messages.test.ts`'s equality guarantee over the keys
 * mobile actually uses.
 */

const catalogues = { tr, en } as const

export type Locale = keyof typeof catalogues

export function t(
  locale: Locale,
  key: string,
  values: Record<string, string | number> = {},
): string {
  let node: unknown = catalogues[locale]
  for (const segment of key.split('.')) {
    if (typeof node !== 'object' || node === null) break
    node = (node as Record<string, unknown>)[segment]
  }

  // next-intl's own failure mode, kept on purpose: a missing key renders its path, loudly
  // wrong on every screen instead of quietly blank.
  if (typeof node !== 'string') return key

  return node.replace(/\{\s*([A-Za-z0-9_]+)\s*\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  )
}
