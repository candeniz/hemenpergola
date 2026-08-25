import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import en from '../src/i18n/messages/en.json'
import tr from '../src/i18n/messages/tr.json'

/**
 * The mobile app reads the SAME catalogues next-intl serves (`I18N-01`), so
 * `messages.test.ts`'s equality guarantee — every key in both locales, same placeholders —
 * already covers whatever mobile uses. What it cannot see is a key mobile asks for that
 * exists in NEITHER catalogue: the resolver renders the key path (next-intl's own failure
 * mode, kept deliberately), which is loud on a screen and silent in a pipeline.
 *
 * So: the same one-import-hop philosophy as `client-namespaces.test.ts`, aimed at the
 * other renderer — scan `mobile/` for `t(locale, '…')` calls and assert each key resolves
 * in BOTH catalogues.
 */

const MOBILE_SRC = join(process.cwd(), 'mobile')

function resolve(tree: unknown, path: string): unknown {
  let node = tree
  for (const segment of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[segment]
  }
  return node
}

function usedKeys(): Map<string, string[]> {
  const byFile = new Map<string, string[]>()
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.expo') continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx?$/.test(entry.name)) {
        const keys = [...readFileSync(path, 'utf8').matchAll(/\bt\(\s*\w+,\s*'([^']+)'/g)].map(
          (match) => match[1] as string,
        )
        if (keys.length > 0) byFile.set(path, keys)
      }
    }
  }
  walk(MOBILE_SRC)
  return byFile
}

describe('I18N-01 · every key the mobile app uses exists in both catalogues', () => {
  const used = usedKeys()

  it('found the mobile surface (the scan is not silently scanning nothing)', () => {
    expect([...used.values()].flat().length).toBeGreaterThan(5)
  })

  it('resolves every used key in tr and en', () => {
    const missing: string[] = []
    for (const [file, keys] of used) {
      for (const key of keys) {
        for (const [locale, tree] of [
          ['tr', tr],
          ['en', en],
        ] as const) {
          if (typeof resolve(tree, key) !== 'string') missing.push(`${locale}:${key} (${file})`)
        }
      }
    }
    expect(missing, 'keys the mobile app would render as their own path').toEqual([])
  })
})
