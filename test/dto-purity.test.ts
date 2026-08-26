import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * `CLAUDE.md` §Conventions: *"One Zod schema per use case in `modules/<m>/application/dto`"*
 * — held as a test since Phase 11.2, because the codebase had drifted from it for ten
 * phases and mobile is the consumer that made the drift cost something: a schema living
 * inside a `server-only` + Prisma service file cannot be imported by a React Native
 * runtime at all.
 *
 * Since 12.1 the purity scan is **map-driven**: it reads `mobile/contract-map.json` and
 * covers every closure the map opens to the phone, so a new alias is born guarded instead
 * of guarded when somebody remembers. The lesson it encodes: `@legal` shipped in 11.4
 * pointing at a whole directory that no test scanned — one pure file today, and nothing
 * holding the class of file it must remain.
 *
 * Two claims:
 *
 *   **Every module has the dto file** — the `@contracts` pattern resolves for every
 *   module, uniformly, rather than for the modules someone has needed so far.
 *
 *   **Every mapped closure is runtime-pure.** Each entry file and everything it *runtime*-
 *   imports (transitively, within `src/`) must be free of `server-only`, Prisma, the env
 *   parse and `process.env`. `import type` lines are exempt — they are erased before a
 *   bundle exists, so a type borrowed from an impure file is safe where a value is not.
 */

const ROOT = process.cwd()
const MODULES_DIR = join(ROOT, 'src', 'modules')

const FORBIDDEN = [
  { needle: "import 'server-only'", why: 'server-only throws in any non-server runtime' },
  { needle: "from '@/shared/db'", why: 'the Prisma client cannot exist on a device' },
  { needle: "from '@prisma/client'", why: 'the Prisma client cannot exist on a device' },
  { needle: "from '@/shared/config/env'", why: 'the env parse reads server secrets' },
  { needle: 'process.env', why: 'a contract file must not depend on an environment' },
] as const

/** Docblocks talk ABOUT these things legitimately; only code may not touch them. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

function modules(): string[] {
  return readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/** Runtime import specifiers only — `import type` is erased and deliberately exempt. */
function runtimeImports(source: string): string[] {
  const withoutTypeImports = source.replace(/import\s+type\s[^;]+;/g, '')
  return [...withoutTypeImports.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
    (match) => match[1] as string,
  )
}

function resolveWithin(from: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('.')) base = resolve(dirname(from), specifier)
  else if (specifier.startsWith('@/')) base = join(ROOT, 'src', specifier.slice(2))
  else return null // a package — zod and friends are fine

  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && !candidate.endsWith(`${base}`)) return candidate
    if (existsSync(`${base}.ts`)) return `${base}.ts`
  }
  return existsSync(base) ? base : null
}

function closureOf(entry: string): Map<string, string> {
  const seen = new Map<string, string>()
  const queue = [entry]

  while (queue.length > 0) {
    const file = queue.pop() as string
    if (seen.has(file)) continue
    const source = readFileSync(file, 'utf8')
    seen.set(file, source)

    for (const specifier of runtimeImports(source)) {
      const resolved = resolveWithin(file, specifier)
      if (resolved !== null && !seen.has(resolved)) queue.push(resolved)
    }
  }
  return seen
}

/**
 * Expand one contract-map target into concrete entry files. `src/modules/<m>/application/dto`
 * becomes one dto.ts per module; `src/i18n/messages/<f>` and `src/shared/legal/<f>` become the
 * files of those directories.
 */
function expandTarget(target: string): string[] {
  const starAt = target.indexOf('*')
  if (starAt < 0) return [join(ROOT, target)]

  const baseDir = join(ROOT, target.slice(0, starAt).replace(/\/$/, ''))
  const suffix = target.slice(starAt + 1) // '/application/dto' or ''
  const entries: string[] = []

  for (const child of readdirSync(baseDir, { withFileTypes: true })) {
    if (suffix === '') {
      if (child.isFile()) entries.push(join(baseDir, child.name))
      continue
    }
    const candidate = join(baseDir, child.name, suffix.replace(/^\//, ''))
    if (existsSync(candidate)) entries.push(candidate)
    else if (existsSync(`${candidate}.ts`)) entries.push(`${candidate}.ts`)
  }
  return entries
}

describe('CLAUDE.md §Conventions · the contract surface exists and is runtime-pure', () => {
  it('every module carries application/dto.ts — the file @contracts/* points at', () => {
    const missing = modules().filter(
      (name) => !existsSync(join(MODULES_DIR, name, 'application', 'dto.ts')),
    )
    expect(missing, 'modules with no contract surface').toEqual([])
  })

  it('every closure the contract map opens to the phone is runtime-pure', () => {
    const map = JSON.parse(
      readFileSync(join(ROOT, 'mobile', 'contract-map.json'), 'utf8'),
    ) as Record<string, string>

    const entries = Object.values(map).flatMap(expandTarget)

    // 16 module dtos + 2 catalogues + at least one legal file. A scan that expanded to
    // less than that is a broken scan passing on nothing.
    expect(entries.length, 'the map expanded to too little').toBeGreaterThan(18)

    const violations: string[] = []
    for (const entry of entries) {
      if (!/\.tsx?$/.test(entry)) continue // JSON catalogues have no imports
      for (const [file, source] of closureOf(entry)) {
        const code = stripComments(source)
        for (const { needle, why } of FORBIDDEN) {
          if (code.includes(needle))
            violations.push(`${entry}: ${file} contains ${needle} (${why})`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
