import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * One palette, two renderers — `22-design-system.md`'s tokens live in `globals.css` as
 * `@theme` blocks (Tailwind 4: the block IS the config), and React Native does not read
 * CSS. This script derives `mobile/src/theme/tokens.json` from the same blocks, and
 * `test/design-tokens-parity.test.ts` re-derives and compares on every `pnpm test` — the
 * same discipline as `reference-dirs.mjs`: a value maintained by two hands is a value that
 * WILL disagree, so the second copy is generated and asserted, never edited.
 *
 * Only var(--…)-free declarations travel: a mobile theme needs resolved values, and the
 * semantic layer's `var()` indirections are a CSS mechanism. The semantic names are
 * resolved through their raw targets instead.
 */

export function deriveTokens(css) {
  const blocks = [...css.matchAll(/@theme\s*\{([\s\S]*?)\n\}/g)].map((match) => match[1])
  const raw = {}

  for (const block of blocks) {
    for (const declaration of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      raw[declaration[1]] = declaration[2].trim()
    }
  }

  // Resolve one level of var(--x) indirection (the semantic layer points at raw roles).
  const resolved = {}
  for (const [name, value] of Object.entries(raw)) {
    const reference = /^var\(--([a-z0-9-]+)\)$/.exec(value)
    resolved[name] = reference ? (raw[reference[1]] ?? value) : value
  }

  // Drop what still references a runtime-injected property after resolution — the font
  // stacks point at next/font's variables, which exist only in a browser. Font FACES are
  // platform assets on mobile (loaded by name, not by custom property) and arrive with the
  // screen work, not the palette.
  for (const [name, value] of Object.entries(resolved)) {
    if (value.includes('var(')) delete resolved[name]
  }

  return resolved
}

const root = process.cwd()
const css = readFileSync(join(root, 'src', 'app', '[locale]', 'globals.css'), 'utf8')
const tokens = deriveTokens(css)

writeFileSync(
  join(root, 'mobile', 'src', 'theme', 'tokens.json'),
  `${JSON.stringify(tokens, null, 2)}\n`,
)
console.log(`generate-mobile-tokens: ${Object.keys(tokens).length} tokens written`)
