import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { consentTextVersion, loadConsentText } from './consent-text'

/**
 * `19-security-and-kvkk.md` §Consent — the version recorded with a consent must be the
 * version of the text that was shown.
 *
 * This is the test the design exists for. A hand-maintained constant passes every check
 * anyone would think to write, right up until somebody edits the text and forgets the
 * constant — and from then on every `Consent` row records agreement to a document nobody
 * agreed to, silently, with no way to tell afterwards which rows are wrong.
 */

const digest = (body: string) => createHash('sha256').update(body).digest('hex').slice(0, 8)

describe('consent text', () => {
  it('loads the committed Turkish terms', () => {
    const text = loadConsentText('TERMS')

    expect(text.body.length).toBeGreaterThan(200)
    expect(text.body).toContain('KVKK')
    expect(text.body).toContain('Kullanım Koşulları')
  })

  it('names the version after the file and its bytes', () => {
    expect(consentTextVersion('TERMS')).toMatch(/^terms\.tr@[0-9a-f]{8}$/)
  })

  it('is stable across calls', () => {
    expect(consentTextVersion('TERMS')).toBe(consentTextVersion('TERMS'))
  })

  it('derives the version from the current body, not from a literal', () => {
    // Recomputing it here from what was read proves the coupling is real. If the version were
    // a constant this fails on the first edit to the text — which is the point.
    const text = loadConsentText('TERMS')

    expect(text.version).toBe(`terms.tr@${digest(text.body)}`)
  })

  it('would change if a single character changed', () => {
    /*
     * The failure mode this guards: the text changes, the version does not, and the consent
     * record lies. A one-character edit — the kind a lawyer's review produces by the dozen —
     * must produce a different version.
     */
    const text = loadConsentText('TERMS')

    expect(digest(`${text.body}\n<!-- one added clause -->`)).not.toBe(digest(text.body))
    expect(digest(text.body.replace('KDV hariçtir', 'KDV dahildir'))).not.toBe(digest(text.body))
  })

  it('carries the KVKK claims the registration screen promises', () => {
    const { body } = loadConsentText('TERMS')

    // 19 §Contact disclosure and ADR-006, in the words the user actually reads. If either
    // decision is reversed, this test is where the reversal has to be argued for.
    expect(body).toContain('açıkça onay vermeden hiçbir üreticiye aktarılmaz')
    expect(body).toContain('tahmindir')
  })
})
