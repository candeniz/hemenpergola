import { describe, expect, it } from 'vitest'

import en from './messages/en.json'
import tr from './messages/tr.json'

/**
 * Both locales, every key (`I18N-01`, `CLAUDE.md` §Definition of done: *"both locales
 * render"*).
 *
 * A missing key does not throw in next-intl — it renders the key path, in a build that
 * passes every other check. The five auth screens doubled the catalogue in one commit, which
 * is exactly the size of change where one nested object gets forgotten.
 */

type Tree = { [key: string]: string | Tree }

function paths(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`
    return typeof value === 'string' ? [path] : paths(value, path)
  })
}

/** `{name}` and `{count, plural, …}` — the arguments a message expects. */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{\s*([A-Za-z0-9_]+)\s*[,}]/g)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined)
    .sort()
}

function messageAt(tree: Tree, path: string): string {
  const value = path.split('.').reduce<string | Tree | undefined>((node, key) => {
    if (node === undefined || typeof node === 'string') return undefined
    return node[key]
  }, tree)

  return typeof value === 'string' ? value : ''
}

const trPaths = paths(tr as Tree)
const enPaths = paths(en as Tree)

describe('message catalogues', () => {
  it('has the same keys in both locales', () => {
    expect(enPaths.filter((path) => !trPaths.includes(path))).toEqual([])
    expect(trPaths.filter((path) => !enPaths.includes(path))).toEqual([])
  })

  it('has no empty message in either locale', () => {
    const empty = [
      ...trPaths.filter((path) => messageAt(tr as Tree, path).trim() === '').map((p) => `tr.${p}`),
      ...enPaths.filter((path) => messageAt(en as Tree, path).trim() === '').map((p) => `en.${p}`),
    ]

    expect(empty).toEqual([])
  })

  it('uses the same placeholders on both sides of a pair', () => {
    /*
     * The failure this catches is not a missing translation — it is a translated message
     * that dropped `{count}`, which renders as a sentence with a hole in it and passes every
     * other test. `{brand}` is deliberately escaped as `'{brand}'` in both catalogues (Q1),
     * so it is not a placeholder and does not appear here.
     */
    const mismatched = trPaths.filter((path) => {
      const a = placeholders(messageAt(tr as Tree, path))
      const b = placeholders(messageAt(en as Tree, path))
      return a.join(',') !== b.join(',')
    })

    expect(mismatched).toEqual([])
  })

  it('covers the auth screens in both locales', () => {
    // The five screens of task 1.4 plus the phone screen and the 403 boundary.
    for (const key of [
      'auth.register.title',
      'auth.login.title',
      'auth.forgot.title',
      'auth.reset.title',
      'auth.verifyEmail.title',
      'auth.verifyPhone.title',
      'auth.forbidden.title',
    ]) {
      expect(trPaths, key).toContain(key)
      expect(messageAt(tr as Tree, key).length, `tr.${key}`).toBeGreaterThan(2)
      expect(messageAt(en as Tree, key).length, `en.${key}`).toBeGreaterThan(2)
    }
  })

  it('keeps the Turkish and English strings actually different', () => {
    // Copying the Turkish into `en.json` to make the parity test pass is the obvious way to
    // fake this, and it produces a page that is "translated" and unreadable.
    /*
     * One legitimate exception, named rather than pattern-matched away: a Turkish mobile
     * number is written the same way on an English page, and inventing a different example
     * would teach the reader a format the field rejects.
     */
    const SAME_IN_BOTH = ['auth.phonePlaceholder']

    const identical = trPaths.filter((path) => {
      if (SAME_IN_BOTH.includes(path)) return false
      const a = messageAt(tr as Tree, path)
      return a.length > 12 && a === messageAt(en as Tree, path)
    })

    expect(identical).toEqual([])
  })
})
