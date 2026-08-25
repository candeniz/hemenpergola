import tokens from './tokens.json'

/**
 * The web palette, verbatim — `tokens.json` is GENERATED from `globals.css`'s `@theme`
 * blocks by `scripts/generate-mobile-tokens.mjs` and pinned by
 * `test/design-tokens-parity.test.ts`. Never edit the JSON; regenerate it.
 *
 * The names here are `22`'s semantic layer (panel, muted, divider…), same as the Tailwind
 * utilities the web uses — a screen ported from web to mobile keeps its colour vocabulary.
 */

const token = (name: string): string => {
  const value = (tokens as Record<string, string>)[name]
  if (value === undefined) throw new Error(`unknown design token: ${name}`)
  return value
}

export const colors = {
  page: token('color-page'),
  panel: token('color-panel'),
  text: token('color-on-surface'),
  muted: token('color-muted'),
  divider: token('color-divider'),
  primary: token('color-primary'),
  onPrimary: token('color-on-primary'),
  destructive: token('color-destructive'),
  onDestructive: token('color-on-destructive'),
  confirm: token('color-confirm'),
} as const
