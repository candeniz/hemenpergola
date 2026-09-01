import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The error boundaries' contract — task 14.2.
 *
 * These two files are the pages a person meets on the worst day, and they cannot be
 * exercised end to end without a route that throws on purpose — which would be a production
 * surface built to serve a test. What matters about them is not how they look but what they
 * **refuse to say**, and that is a property of the source:
 *
 *   **`error.digest` and nothing else.** Next replaces an error's message with a digest in
 *   production precisely so a stack trace never reaches a browser. A boundary that renders
 *   `error.message` undoes that in development *and* leaks the shape of the failure to
 *   whoever provoked it — and it is the obvious thing to add while debugging.
 *
 *   **`global-error.tsx` renders its own document.** It catches a throw in the root layout,
 *   so `<html>` and `<body>` never rendered. Without them the page is blank, which is the
 *   failure it exists to prevent.
 *
 * The 404's behaviour is `e2e/error-surfaces.spec.ts` — that one can be provoked honestly,
 * by asking for a page that is not there.
 */

const read = (...segments: string[]): string =>
  readFileSync(join(process.cwd(), 'src', 'app', ...segments), 'utf8')

/** Comments discuss `error.message` at length; the ban is on rendering it. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('14.2 · the error boundaries', () => {
  const locale = stripComments(read('[locale]', 'error.tsx'))
  const global = stripComments(read('global-error.tsx'))

  it('never renders the error message or a stack', () => {
    for (const [name, source] of [
      ['[locale]/error.tsx', locale],
      ['global-error.tsx', global],
    ] as const) {
      expect(source, `${name} must not render error.message`).not.toMatch(/error\.message/)
      expect(source, `${name} must not render a stack`).not.toMatch(/error\.stack/)
      expect(source, `${name} must not stringify the whole error`).not.toMatch(
        /JSON\.stringify\(\s*error/,
      )
    }
  })

  it('shows the digest, which is what a support conversation needs', () => {
    expect(locale).toMatch(/error\.digest/)
    expect(global).toMatch(/error\.digest/)
  })

  it('are client components — an error boundary has to offer reset()', () => {
    for (const [name, source] of [
      ['[locale]/error.tsx', locale],
      ['global-error.tsx', global],
    ] as const) {
      expect(source.trimStart(), name).toMatch(/^'use client'/)
      expect(source, `${name} must call reset()`).toMatch(/reset/)
    }
  })

  it('global-error renders its own html and body, because nothing above it did', () => {
    expect(global).toMatch(/<html/)
    expect(global).toMatch(/<body/)
  })

  it('global-error carries both languages, since it has no locale to choose with', () => {
    // The one documented `I18N-01` exception: the provider lives inside the layout that
    // failed. Showing both beats guessing one — and beats an English-only last resort.
    expect(global).toContain('Bir şeyler ters gitti')
    expect(global).toContain('Something went wrong')
  })

  it('is the only file allowed to disable the no-literals rule', () => {
    // `I18N-01` is a non-negotiable; a second file switching it off should be a diff
    // somebody argues, not a line that slips in.
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.tsx?$/.test(entry)) {
          const source = readFileSync(path, 'utf8')
          if (source.includes('eslint-disable') && source.includes('jsx-no-literals')) {
            offenders.push(path.replace(process.cwd(), '').replace(/\\/g, '/'))
          }
        }
      }
    }
    walk(join(process.cwd(), 'src'))

    expect(offenders).toEqual(['/src/app/global-error.tsx'])
  })
})
