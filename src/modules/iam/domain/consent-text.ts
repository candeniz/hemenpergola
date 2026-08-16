import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * The consent texts, and the version of each.
 *
 * `19-security-and-kvkk.md` §Consent: *"The consent text lives in the repo, versioned;
 * changing it creates a new `textVersion`."*
 *
 * **The version is derived from the file's content, not declared next to it.** A constant
 * would need updating by hand every time the wording changed, and the failure mode is
 * silent and total: the text changes, the version does not, and every consent row from then
 * on records agreement to a document nobody agreed to. A content hash cannot drift from the
 * thing it describes.
 */

const TEXTS = {
  TERMS: { tr: '../../../legal/terms.tr.md' },
} as const

export type ConsentTextKey = keyof typeof TEXTS

export type ConsentText = {
  /** e.g. `terms.tr@3f9a1c2b` — readable, and pinned to the bytes. */
  version: string
  body: string
}

const cache = new Map<string, ConsentText>()

export function loadConsentText(key: ConsentTextKey, locale: 'tr' | 'en' = 'tr'): ConsentText {
  const cacheKey = `${key}:${locale}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  // Only `tr` exists today; `19` requires the text to be reviewed before launch and the
  // English version is written with it rather than machine-translated.
  const relative = TEXTS[key].tr
  const path = fileURLToPath(new URL(relative, import.meta.url))
  const body = readFileSync(path, 'utf8')

  const digest = createHash('sha256').update(body).digest('hex').slice(0, 8)
  const name = relative.split('/').pop()?.replace(/\.md$/, '') ?? key.toLowerCase()

  const text: ConsentText = { version: `${name}@${digest}`, body }
  cache.set(cacheKey, text)
  return text
}

/** The version alone, which is what goes into the `Consent` row. */
export function consentTextVersion(key: ConsentTextKey, locale: 'tr' | 'en' = 'tr'): string {
  return loadConsentText(key, locale).version
}
