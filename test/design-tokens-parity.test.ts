import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// A plain relative import would work too; going through the generator makes this test and
// the artifact provably share one derivation.
import { deriveTokens } from '../scripts/generate-mobile-tokens.mjs'

/**
 * One palette, two renderers, zero drift — the `reference-dirs.mjs` discipline applied to
 * design tokens (`22-design-system.md`).
 *
 * `globals.css`'s `@theme` blocks are the single source; `mobile/src/theme/tokens.json`
 * is GENERATED from them by `scripts/generate-mobile-tokens.mjs` and committed, because
 * Metro cannot parse CSS and a build-time hook it depends on is a build that breaks on a
 * fresh checkout. Committed-and-generated means someone can hand-edit the copy — which is
 * exactly the door this test closes: the JSON must equal what the CSS derives, byte for
 * byte, or `pnpm test` fails and names the command that repairs it.
 */

describe('22 · the mobile theme is the web theme, derived not maintained', () => {
  const css = readFileSync(join(process.cwd(), 'src', 'app', '[locale]', 'globals.css'), 'utf8')
  const derived = deriveTokens(css) as Record<string, string>
  const committed = JSON.parse(
    readFileSync(join(process.cwd(), 'mobile', 'src', 'theme', 'tokens.json'), 'utf8'),
  ) as Record<string, string>

  it('found a palette large enough to be the real one', () => {
    expect(Object.keys(derived).length).toBeGreaterThan(100)
  })

  it('matches the committed mobile tokens exactly — regenerate with `node scripts/generate-mobile-tokens.mjs`', () => {
    expect(committed).toEqual(derived)
  })

  it('carries no unresolved var() — a mobile renderer has no custom-property engine', () => {
    const unresolved = Object.entries(committed).filter(([, value]) => value.includes('var('))
    expect(unresolved).toEqual([])
  })
})
