import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// The single source the executable configs import (`ADR-029`).
import { REFERENCE_DIRS } from '../reference-dirs.mjs'

/**
 * The reference-folder list had two copies and they drifted: `Prompt/` was named in
 * `eslint.config.mjs` and not in `next.config.ts`, and the handover document said both had
 * been cleaned when neither had. `ADR-029` collapsed the executable configs onto one module.
 *
 * **This test closes exactly two doors**, the two build-exclusion consumers whose formats
 * cannot import anything:
 *
 *   `.prettierignore` — every non-comment entry is either a reference folder or one of the
 *   named deliberate entries, so a stale folder cannot linger there.
 *   `tsconfig.json` — its `exclude`, minus a named set of non-folders, equals the list.
 *
 * **What it does not close.** Four files embed a folder name inside a document path —
 * `generate-permission-table.mjs`, `permissions.test.ts`, `nav-items.test.ts`,
 * `performance-templates.test.ts` — and nothing here pins them. A rename surfaces there as
 * a failed file read in whichever suite touches it first, which is late but not silent.
 * Prose in `CLAUDE.md`, `README.md` and `28-handover.md` names the folders too, and no test
 * can hold prose to a list.
 */
describe('reference directories · one list, every consumer', () => {
  const root = process.cwd()

  it('names exactly the two committed reference folders', () => {
    expect(REFERENCE_DIRS).toEqual(['Frontend Tasarım', 'Yazılım Mimari Promptlar'])
  })

  it('.prettierignore ignores exactly those folders — no more, no fewer', () => {
    const lines = readFileSync(join(root, '.prettierignore'), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))

    for (const dir of REFERENCE_DIRS) {
      expect(lines, `.prettierignore must ignore ${dir}`).toContain(dir)
    }

    // A folder ignored here that no longer exists is a path the next reader goes looking
    // for — the exact defect `Prompt` was. Every non-comment entry either names a
    // reference folder or is one of the deliberate non-folder entries.
    const deliberate = new Set([
      'node_modules',
      '.next',
      'coverage',
      'pnpm-lock.yaml',
      '/README.md',
      '/CLAUDE.md',
      '/docs',
    ])
    const unexplained = lines.filter(
      (line) => !deliberate.has(line) && !(REFERENCE_DIRS as string[]).includes(line),
    )
    expect(unexplained, 'unexplained .prettierignore entries').toEqual([])
  })

  it('tsconfig.json excludes exactly those folders, plus a named set of non-folders', () => {
    const raw = readFileSync(join(root, 'tsconfig.json'), 'utf8')
    const exclude = /"exclude"\s*:\s*\[([\s\S]*?)\]/.exec(raw)?.[1] ?? ''
    const entries = [...exclude.matchAll(/"([^"]+)"/g)].map((match) => match[1] as string)

    for (const dir of REFERENCE_DIRS) {
      expect(entries, `tsconfig must exclude ${dir}`).toContain(dir)
    }

    // Same shape as the `.prettierignore` block above, and for the same reason: the first
    // version of this assertion filtered for entries matching /Prompt|^Frontend/, which
    // caught `Yazılım Mimari Promptlar` only because "Promptlar" happens to contain
    // "Prompt". A stale entry outside that pattern passed, and a third reference folder
    // outside it would have failed a correct tsconfig. Name the exceptions instead.
    const deliberate = new Set(['node_modules', '.next', 'test/fixtures/boundary'])
    const remainder = entries.filter((entry) => !deliberate.has(entry)).sort()
    expect(remainder, 'unexplained tsconfig exclude entries').toEqual([...REFERENCE_DIRS].sort())
  })

  it('every named folder actually exists — a dead entry is a path someone will hunt for', () => {
    for (const dir of REFERENCE_DIRS) {
      expect(statSync(join(root, dir)).isDirectory(), `${dir} must exist`).toBe(true)
      expect(
        readFileSync(join(root, 'CLAUDE.md'), 'utf8'),
        `CLAUDE.md §Layout must name ${dir}`,
      ).toContain(dir)
    }
  })
})
