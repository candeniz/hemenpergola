import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * `CLAUDE.md` §Conventions: *"One Zod schema per use case in `modules/<m>/application/dto`"*
 * — held as a test since Phase 11.2, because the codebase had drifted from it for ten
 * phases and mobile is the consumer that made the drift cost something: a schema living
 * inside a `server-only` + Prisma service file cannot be imported by a React Native
 * runtime at all, and `@contracts/*` (the phone's only door into `src/`) points at
 * exactly these files.
 *
 * Two claims:
 *
 *   **Every module has the dto file** — the alias resolves for every module, uniformly,
 *   rather than for the modules someone has needed so far.
 *
 *   **Every dto closure is runtime-pure.** The dto file and everything it *runtime*-
 *   imports (transitively, within `src/`) must be free of `server-only`, Prisma, the env
 *   parse and `process.env`. `import type` lines are exempt — they are erased before a
 *   bundle exists, so a type borrowed from an impure file is safe where a value is not.
 */

const MODULES_DIR = join(process.cwd(), 'src', 'modules')

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
  else if (specifier.startsWith('@/')) base = join(process.cwd(), 'src', specifier.slice(2))
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

describe('CLAUDE.md §Conventions · the contract surface exists and is runtime-pure', () => {
  it('every module carries application/dto.ts — the file @contracts/* points at', () => {
    const missing = modules().filter(
      (name) => !existsSync(join(MODULES_DIR, name, 'application', 'dto.ts')),
    )
    expect(missing, 'modules with no contract surface').toEqual([])
  })

  it('no dto closure touches server-only, Prisma, the env parse or process.env', () => {
    const violations: string[] = []

    for (const name of modules()) {
      const dto = join(MODULES_DIR, name, 'application', 'dto.ts')
      if (!existsSync(dto)) continue

      for (const [file, source] of closureOf(dto)) {
        const code = stripComments(source)
        for (const { needle, why } of FORBIDDEN) {
          if (code.includes(needle)) violations.push(`${name}: ${file} contains ${needle} (${why})`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
