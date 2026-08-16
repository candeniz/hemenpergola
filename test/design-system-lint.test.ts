import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { describe, expect, it, vi } from 'vitest'

/**
 * The design-system rules, watched failing — `22-design-system.md` Rule 1 and
 * §Semantic mapping.
 *
 * The boundary rules had a fixture from Phase 0; these did not, and the gap cost something
 * real. `max-w-lg` on `ui/dialog.tsx` shipped in Phase 0 and made every dialog forty-eight
 * pixels wide, and the same mistake landed again on the auth card in Phase 1. Nothing
 * caught either one, because a class that resolves to the wrong scale is not a hex literal
 * and not an arbitrary value — it is an ordinary class name that happens to mean something
 * else here.
 */

const eslint = new ESLint({ cwd: process.cwd() })

async function lintAsComponent(source: string) {
  const results = await eslint.lintText(source, {
    filePath: fileURLToPath(new URL('../src/components/__design-probe.tsx', import.meta.url)),
  })
  return (results[0]?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-syntax')
}

const component = (className: string) =>
  `export function Probe() { return <div className="${className}" /> }\n`

vi.setConfig({ testTimeout: 30_000 })

describe('22 Rule 1 · tokens only', () => {
  it('rejects a hex literal', async () => {
    const messages = await lintAsComponent(component('bg-[#162839]'))
    expect(messages.length).toBeGreaterThanOrEqual(1)
    expect(messages.some((m) => /hex literals/.test(m.message))).toBe(true)
  })

  it('rejects an arbitrary value', async () => {
    const messages = await lintAsComponent(component('p-[13px]'))
    expect(messages.some((m) => /arbitrary Tailwind values/.test(m.message))).toBe(true)
  })

  it('allows an arbitrary *variant*, which is a selector and not a value', async () => {
    // Radix state styling is written this way; banning it would ban the primitives.
    const messages = await lintAsComponent(
      component('data-[state=checked]:bg-action aria-[invalid=true]:border-destructive'),
    )
    expect(messages).toEqual([])
  })
})

describe('22 §Semantic mapping · no raw palette names', () => {
  it('rejects a raw role used as a call-site colour', async () => {
    // The one that caught `hover:bg-on-error-container`: a foreground role used as a
    // background, which reads fine and is wrong.
    const messages = await lintAsComponent(component('bg-on-error-container'))
    expect(messages.some((m) => /raw palette names/.test(m.message))).toBe(true)
  })

  it('allows the semantic alias for the same thing', async () => {
    expect(await lintAsComponent(component('bg-destructive text-on-destructive'))).toEqual([])
  })
})

describe('the size scale that means something else here', () => {
  it.each(['max-w-md', 'max-w-lg', 'max-w-sm', 'max-w-xl', 'w-lg'])(
    'rejects %s, which resolves to the spacing token',
    async (className) => {
      /*
       * This theme defines a custom spacing scale with `sm`/`md`/`lg`/`xl`. In Tailwind 4 a
       * `max-w-*` utility resolves against the container namespace **and** the spacing
       * namespace, and spacing wins — so `max-w-md` is 24px here, not 28rem.
       *
       * Nothing about the class looks wrong. The card is simply twenty-four pixels wide, the
       * text wraps one character per line, and Playwright reports the heading as `hidden`
       * because its bounding box has zero width. That is how it was finally found.
       */
      const messages = await lintAsComponent(component(className))
      expect(messages.some((m) => /spacing.*scale|container width/.test(m.message))).toBe(true)
    },
  )

  it('allows the named container tokens', async () => {
    expect(await lintAsComponent(component('max-w-page'))).toEqual([])
    expect(await lintAsComponent(component('max-w-form'))).toEqual([])
    expect(await lintAsComponent(component('max-w-dialog'))).toEqual([])
  })

  it('leaves the spacing utilities themselves alone', async () => {
    // `gap-md`, `p-md`, `py-xl` are the scale working as intended. Only the *size*
    // utilities collide.
    expect(await lintAsComponent(component('flex flex-col gap-md p-md py-xl'))).toEqual([])
  })

  it('does not apply outside components — /dev/tokens renders the swatches on purpose', async () => {
    const results = await eslint.lintText("export const swatch = { className: 'w-md' }\n", {
      filePath: fileURLToPath(new URL('../src/app/[locale]/dev/tokens/probe.ts', import.meta.url)),
    })

    expect((results[0]?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-syntax')).toEqual(
      [],
    )
  })
})
