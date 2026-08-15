#!/usr/bin/env node
/**
 * Audits `src/components` for raw palette names used as Tailwind colour utilities.
 *
 * 22-design-system.md §Semantic mapping: application code writes semantic names
 * (`bg-panel`, `text-muted`, `hover:bg-action-hover`). A raw role name (`bg-primary`,
 * `hover:bg-secondary-fixed-dim`) means the design system was bypassed at the call site.
 *
 * Run: node scripts/audit-raw-tokens.mjs [--json]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const CSS = 'src/app/[locale]/globals.css'
const ROOT = 'src/components'

const COLOUR_UTILITIES = [
  'bg',
  'text',
  'border',
  'ring',
  'fill',
  'stroke',
  'divide',
  'outline',
  'from',
  'via',
  'to',
  'shadow',
  'accent',
  'caret',
  'decoration',
  'placeholder',
]

function themeBlocks(css) {
  const starts = [...css.matchAll(/@theme\s*\{/g)].map((m) => m.index)
  if (starts.length < 2) {
    throw new Error(`Expected two @theme blocks in ${CSS}, found ${starts.length}`)
  }
  const names = (chunk) => [...chunk.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1])
  return {
    raw: names(css.slice(starts[0], starts[1])),
    semantic: names(css.slice(starts[1])),
  }
}

function sourceFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(path))
    else if (/\.tsx?$/.test(entry.name)) out.push(path)
  }
  return out
}

const css = readFileSync(CSS, 'utf8')
const { raw, semantic } = themeBlocks(css)
const rawOnly = new Set(raw.filter((name) => !semantic.includes(name)))

// Longest-first, so `bg-surface-container-high` is not read as `bg-surface` + suffix.
const sorted = [...rawOnly].sort((a, b) => b.length - a.length)
const pattern = new RegExp(
  `(?:^|["'\\s:])(?:[a-z0-9-]+(?:\\[[^\\]]*\\])?:)*(${COLOUR_UTILITIES.join('|')})-(${sorted.join('|')})(?![a-z0-9-])`,
  'g',
)

const files = sourceFiles(ROOT)
const hits = []

for (const file of files) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      for (const match of line.matchAll(pattern)) {
        hits.push({
          file: file.replaceAll('\\', '/'),
          line: index + 1,
          utility: match[0].trim().replace(/^["']/, ''),
          token: match[2],
        })
      }
    })
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ files: files.length, hits }, null, 2))
} else {
  console.log(`scanned   : ${files.length} files under ${ROOT}`)
  console.log(`raw tokens: ${rawOnly.size} declared, ${semantic.length} semantic aliases`)
  console.log(`raw uses  : ${hits.length}`)

  const byFile = new Map()
  for (const hit of hits) {
    if (!byFile.has(hit.file)) byFile.set(hit.file, [])
    byFile.get(hit.file).push(hit)
  }
  for (const [file, list] of byFile) {
    console.log(`\n${file}`)
    for (const hit of list) console.log(`  ${String(hit.line).padStart(3)}  ${hit.utility}`)
  }
}

process.exit(hits.length > 0 ? 1 : 0)
