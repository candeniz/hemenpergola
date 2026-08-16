import { describe, expect, it } from 'vitest'

import { slugify, uniqueSlug } from './slug'

/**
 * Slugs are canonical public URLs (`18-cms-seo.md`), so getting a Turkish letter wrong is
 * not cosmetic — it is a URL that ships, gets indexed, and then cannot be changed without a
 * redirect.
 */

describe('slugify · Turkish letters', () => {
  it.each([
    ['Bioklimatik Pergola', 'bioklimatik-pergola'],
    ['Cam Sistemleri', 'cam-sistemleri'],
    ['Bahçe Işık', 'bahce-isik'],
    ['Güneşlik', 'guneslik'],
    ['Şeffaf Çatı', 'seffaf-cati'],
    ['Öz Pergola', 'oz-pergola'],
    ['İstanbul Ofisi', 'istanbul-ofisi'],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })

  it('folds ı and İ consistently, which naive lower-casing does not', () => {
    /*
     * The two traps, in one test.
     *
     * `'İ'.toLowerCase()` in a non-Turkish locale is `i` + U+0307 COMBINING DOT ABOVE, so a
     * plain `.toLowerCase()` leaves a combining mark in what is supposed to be an ASCII slug.
     * And `ı` has no combining mark to strip, so `NFD` alone folds `ğ`→`g` but leaves `ı`
     * intact — giving `bahce-ık` from "Bahçe Işık".
     */
    expect(slugify('Işık')).toBe('isik')
    expect(slugify('İzmir')).toBe('izmir')
    expect(slugify('IĞDIR')).toBe('igdir')

    // No stray combining characters survived.
    expect(slugify('İstanbul')).toMatch(/^[a-z0-9-]+$/)
  })

  it('keeps distinct words distinct', () => {
    // `bahçe` and `bahce` fold to the same slug, which is correct and is why uniqueness is
    // resolved by suffix rather than assumed.
    expect(slugify('Bahçe')).toBe(slugify('Bahce'))
  })
})

describe('slugify · shape', () => {
  it('collapses punctuation and trims the edges', () => {
    expect(slugify('  Pergola — 4×3 m!  ')).toBe('pergola-4-3-m')
    expect(slugify('A/B (test)')).toBe('a-b-test')
  })

  it('caps the length without leaving a trailing dash', () => {
    const slug = slugify('a'.repeat(200))
    expect(slug.length).toBeLessThanOrEqual(80)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('falls back rather than producing an empty or one-character slug', () => {
    expect(slugify('!!!')).toBe('kayit')
    expect(slugify('x')).toBe('kayit')
    expect(slugify('', 'urun')).toBe('urun')
  })
})

describe('uniqueSlug', () => {
  it('returns the base when it is free', () => {
    expect(uniqueSlug('pergola', new Set())).toBe('pergola')
  })

  it('suffixes from 2', () => {
    expect(uniqueSlug('pergola', new Set(['pergola']))).toBe('pergola-2')
    expect(uniqueSlug('pergola', new Set(['pergola', 'pergola-2']))).toBe('pergola-3')
  })

  it('throws rather than looping forever or returning a duplicate', () => {
    const taken = new Set(['x', ...Array.from({ length: 20 }, (_, i) => `x-${i + 2}`)])
    expect(() => uniqueSlug('x', taken, 10)).toThrowError(/free slug/)
  })
})
