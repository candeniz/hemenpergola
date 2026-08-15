import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { CONTAINER_TOKENS, FONT_SIZE_TOKENS, SHADOW_TOKENS, SPACING_TOKENS, cn } from './utils'

const css = readFileSync(
  fileURLToPath(new URL('../app/[locale]/globals.css', import.meta.url)),
  'utf8',
)

describe('cn', () => {
  it('keeps a font size and a text colour together', () => {
    // The regression that started this: `text-body-sm` was being read as a colour and
    // dropped, silently removing the type scale from most components.
    expect(cn('text-body-sm', 'text-muted')).toBe('text-body-sm text-muted')
    expect(cn('text-label-md', 'text-on-panel')).toBe('text-label-md text-on-panel')
  })

  it('resolves conflicts within a token scale, last one winning', () => {
    expect(cn('px-md', 'px-sm')).toBe('px-sm')
    expect(cn('gap-base', 'gap-md')).toBe('gap-md')
    expect(cn('h-row', 'h-10')).toBe('h-10')
    expect(cn('max-w-page', 'max-w-full')).toBe('max-w-full')
    expect(cn('shadow-ambient', 'shadow-none')).toBe('shadow-none')
    expect(cn('text-body-sm', 'text-body-lg')).toBe('text-body-lg')
  })

  it('still resolves the stock Tailwind scales', () => {
    expect(cn('rounded', 'rounded-lg')).toBe('rounded-lg')
    expect(cn('font-heading', 'font-body')).toBe('font-body')
    expect(cn('bg-panel', 'bg-page')).toBe('bg-page')
  })

  it('handles conditional input', () => {
    expect(cn('a', false && 'b', undefined, ['c', 'd'])).toBe('a c d')
  })
})

describe('token vocabulary matches globals.css', () => {
  it.each(FONT_SIZE_TOKENS)('--text-%s is declared', (token) => {
    expect(css).toContain(`--text-${token}:`)
  })

  it.each(SPACING_TOKENS)('--spacing-%s is declared', (token) => {
    expect(css).toContain(`--spacing-${token}:`)
  })

  it.each(CONTAINER_TOKENS)('--container-%s is declared', (token) => {
    expect(css).toContain(`--container-${token}:`)
  })

  it.each(SHADOW_TOKENS)('--shadow-%s is declared', (token) => {
    expect(css).toContain(`--shadow-${token}:`)
  })

  it('declares no font-size token that tailwind-merge does not know about', () => {
    const declared = [...css.matchAll(/--text-([a-z0-9-]+):/g)]
      .map((match) => match[1] as string)
      // Tailwind emits `--text-<name>--line-height` style sub-properties too.
      .filter((name) => !name.includes('--'))

    for (const name of new Set(declared)) {
      expect(FONT_SIZE_TOKENS as readonly string[]).toContain(name)
    }
  })
})
