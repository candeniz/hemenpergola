import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The `mobile/` → `src/` boundary — `reference-dirs.test.ts`'s discipline on the newest
 * seam.
 *
 * Root ESLint deliberately ignores `mobile/` (its own environment, its own flat config),
 * which means the architectural rules that fence `src/` never look at the one package that
 * imports from it. Three invariants stand in for them:
 *
 *   1. **Every mobile import that reaches `src/` goes through the alias table** —
 *      `@contracts/*` for code, `@messages/*` for the catalogues. A relative path that
 *      climbs out of `mobile/` is a back door around both this test's other rules and the
 *      purity guarantees the aliases point at.
 *   2. **`@contracts/*` may point only at `application/dto`** — the pure contract surface.
 *      An alias quietly widened to a service file would drag `server-only` and Prisma into
 *      a React Native bundle, which fails at runtime on a device and nowhere else.
 *   3. **`tsconfig.json` and `metro.config.js` resolve the aliases identically.** This is
 *      the sharpest edge: they are two independent resolvers, and if they diverge, `tsc`
 *      typechecks one mapping while the device bundles the other — a green pipeline and a
 *      crash on launch. Metro reads `mobile/contract-map.json`; tsconfig cannot import
 *      anything, so this test asserts it equals the map — the `reference-dirs.mjs`
 *      arrangement for a config that cannot participate.
 */

const ROOT = process.cwd()
const MOBILE = join(ROOT, 'mobile')

const ALIAS_PREFIXES = ['@contracts/', '@messages/']

function mobileSourceFiles(): string[] {
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.expo') continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.(ts|tsx|js)$/.test(entry.name)) files.push(path)
    }
  }
  walk(MOBILE)
  return files
}

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:from\s+|import\s+|require\()['"]([^'"]+)['"]/g)].map(
    (match) => match[1] as string,
  )
}

describe('mobile → src boundary', () => {
  const files = mobileSourceFiles()

  it('found the mobile package (the scan is not scanning nothing)', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('never reaches src/ with a relative path — the aliases are the only door', () => {
    const escapes: string[] = []

    for (const file of files) {
      for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
        if (!specifier.startsWith('.')) continue
        const resolved = resolve(dirname(file), specifier)
        if (!(resolved + sep).startsWith(MOBILE + sep)) {
          escapes.push(`${file} → ${specifier}`)
        }
      }
    }

    expect(escapes, 'relative imports escaping mobile/').toEqual([])
  })

  it('uses only declared aliases for shared code, and every use resolves to a real file', () => {
    const map = JSON.parse(readFileSync(join(MOBILE, 'contract-map.json'), 'utf8')) as Record<
      string,
      string
    >

    for (const file of files) {
      for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
        const prefix = ALIAS_PREFIXES.find((candidate) => specifier.startsWith(candidate))
        if (prefix === undefined) continue

        const target = map[`${prefix}*`]
        expect(
          target,
          `${specifier} uses an alias contract-map.json does not declare`,
        ).toBeDefined()

        const rest = specifier.slice(prefix.length)
        const resolved = join(ROOT, (target as string).replace('*', rest))
        const candidates = [
          resolved,
          `${resolved}.ts`,
          `${resolved}.json`,
          join(resolved, 'index.ts'),
        ]
        expect(
          candidates.some((candidate) => {
            try {
              return readFileSync(candidate).length >= 0
            } catch {
              return false
            }
          }),
          `${specifier} resolves to nothing on disk (${file})`,
        ).toBe(true)
      }
    }
  })

  it('keeps @contracts pointing only at application/dto — the pure surface', () => {
    const map = JSON.parse(readFileSync(join(MOBILE, 'contract-map.json'), 'utf8')) as Record<
      string,
      string
    >

    expect(map['@contracts/*']).toBe('src/modules/*/application/dto')
    expect(map['@messages/*']).toBe('src/i18n/messages/*')
    // Two aliases, no third: a new shared surface is a decision, made here first.
    expect(Object.keys(map).sort()).toEqual(['@contracts/*', '@messages/*'])
  })

  it('keeps tsconfig paths identical to the map metro resolves — divergence is a device crash', () => {
    const map = JSON.parse(readFileSync(join(MOBILE, 'contract-map.json'), 'utf8')) as Record<
      string,
      string
    >
    // tsconfig is JSONC — full-line comments carry the aliases' reasoning; strip them.
    const jsonc = readFileSync(join(MOBILE, 'tsconfig.json'), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
    const tsconfig = JSON.parse(jsonc) as {
      compilerOptions: { paths: Record<string, string[]> }
    }
    const paths = tsconfig.compilerOptions.paths

    expect(Object.keys(paths).sort()).toEqual(Object.keys(map).sort())
    for (const [pattern, target] of Object.entries(map)) {
      // tsconfig paths are relative to mobile/, the map to the workspace root.
      expect(paths[pattern]).toEqual([`../${target}`])
    }

    // And metro actually reads the map rather than carrying a copy of it.
    const metro = readFileSync(join(MOBILE, 'metro.config.js'), 'utf8')
    expect(metro).toContain("require('./contract-map.json')")
    expect(metro, 'metro must not carry its own alias table beside the map').not.toContain(
      'extraNodeModules',
    )
  })
})
