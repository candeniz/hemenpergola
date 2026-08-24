import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CLIENT_MESSAGE_NAMESPACES } from './client-namespaces'
import tr from './messages/tr.json'

/**
 * Defends the client-message pick (Phase 8's payload work): every namespace a
 * `'use client'` file reads must be in `CLIENT_MESSAGE_NAMESPACES`, or that component
 * renders raw message keys in the browser — a failure no other test sees, because server
 * rendering (where every namespace exists) masks it.
 */
function clientFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...clientFiles(path))
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      const source = readFileSync(path, 'utf8')
      if (source.startsWith("'use client'")) found.push(path)
    }
  }
  return found
}

/**
 * A file is client not only when it says `'use client'` — anything a client component
 * imports runs on the client too. `estimate-band.tsx` carries no directive, is rendered
 * by `match-results.tsx` (client), and its `estimate` namespace missing from the pick
 * broke the release gate's price bands. So the scan follows imports one hop from every
 * `'use client'` file; deeper chains would need a real module graph, and one hop covers
 * the shared-component pattern this codebase uses.
 */
function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = join(process.cwd(), 'src', specifier.slice(2))
  else if (specifier.startsWith('.')) base = join(fromFile, '..', specifier)
  else return null

  for (const candidate of [`${base}.tsx`, `${base}.ts`]) {
    try {
      readFileSync(candidate)
      return candidate
    } catch {
      /* try the next shape */
    }
  }
  return null
}

describe('client message namespaces', () => {
  it('covers every namespace any client component reads — one import hop included', () => {
    const missing: string[] = []

    const scan = (file: string, origin: string) => {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/useTranslations\(\s*[`']([^`'$]+)[`']/g)) {
        const root = match[1]!.split('.')[0]!
        if (!(CLIENT_MESSAGE_NAMESPACES as readonly string[]).includes(root)) {
          missing.push(`${origin === file ? file : `${file} (via ${origin})`}: ${match[1]}`)
        }
      }
      // The one dynamic call site: mobile-nav's `nav.${namespace}` — its root is 'nav'.
      if (/useTranslations\(\s*`nav\./.test(source)) {
        expect(CLIENT_MESSAGE_NAMESPACES).toContain('nav')
      }
      return source
    }

    for (const file of clientFiles(join(process.cwd(), 'src'))) {
      const source = scan(file, file)
      for (const importMatch of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const resolved = resolveImport(file, importMatch[1]!)
        if (resolved !== null && !resolved.includes('node_modules')) scan(resolved, file)
      }
    }

    expect(missing).toEqual([])
  })

  it('names only namespaces that exist in the catalogue', () => {
    for (const namespace of CLIENT_MESSAGE_NAMESPACES) {
      expect(Object.keys(tr), namespace).toContain(namespace)
    }
  })
})
