import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { checkContrast, contrastRatio, relativeLuminance } from './contrast'
import { contrastPairs, palette, statusTones, type PaletteToken } from './design-tokens'

const cssPath = fileURLToPath(new URL('../app/[locale]/globals.css', import.meta.url))
const css = readFileSync(cssPath, 'utf8')

describe('contrast maths', () => {
  it('matches the WCAG reference values at the extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
  })

  it('is symmetric', () => {
    expect(contrastRatio('#162839', '#f8f9fa')).toBeCloseTo(contrastRatio('#f8f9fa', '#162839'), 10)
  })

  it('truncates rather than rounds, so 4.49 never reports as a pass', () => {
    // #767676 on white is ~4.54; a colour just under the threshold must fail.
    const marginal = checkContrast('#777777', '#ffffff', 'text')
    expect(marginal.ratio).toBeLessThan(4.5)
    expect(marginal.passes).toBe(false)
  })

  it('rejects anything that is not a 6-digit hex colour', () => {
    expect(() => relativeLuminance('#fff')).toThrowError(/hex/)
    expect(() => relativeLuminance('rebeccapurple')).toThrowError(/hex/)
  })
})

describe('token mirror', () => {
  // The palette is declared twice — CSS for Tailwind, TypeScript for the contrast audit.
  // This is what stops the two drifting apart.
  it.each(Object.entries(palette))('globals.css declares %s as %s', (name, value) => {
    expect(css).toContain(`--color-${name}: ${value};`)
  })

  it('declares every semantic alias used by the components', () => {
    for (const alias of [
      'page',
      'panel',
      'panel-subtle',
      'action',
      'confirm',
      'destructive',
      'muted',
      'divider',
      'control-border',
      'status-new',
      'status-progress',
      'status-waiting',
      'status-neutral',
      'status-cancelled',
    ]) {
      expect(css).toContain(`--color-${alias}:`)
    }
  })
})

describe('contrast audit', () => {
  // Pairs the audit deliberately keeps as counter-evidence rather than as a target.
  const isRejected = (label: string) => label.startsWith('rejected:')

  it.each(
    contrastPairs.filter((pair) => !isRejected(pair.label) && pair.requirement !== 'decorative'),
  )('$label meets its WCAG threshold', ({ foreground, background, requirement }) => {
    const result = checkContrast(palette[foreground], palette[background], requirement)
    expect(result.passes, `${foreground} on ${background} is ${result.ratio}:1`).toBe(true)
  })

  it('keeps `divider` too faint to ever be a control boundary', () => {
    // The reason `control-border` exists as a separate semantic name. If someone "fixes"
    // divider by darkening it, this test should be deleted along with that distinction —
    // not left passing by accident.
    const divider = checkContrast(palette['outline-variant'], palette.background, 'ui')
    const controlBorder = checkContrast(palette.outline, palette.background, 'ui')

    expect(divider.passes).toBe(false)
    expect(controlBorder.passes).toBe(true)
  })

  it('keeps every status badge tonally consistent: light background, dark text', () => {
    for (const tone of statusTones) {
      const background = relativeLuminance(palette[tone.background])
      const foreground = relativeLuminance(palette[tone.foreground])

      expect(
        background,
        `${tone.tone} background should be the lighter of the pair`,
      ).toBeGreaterThan(foreground)
      expect(checkContrast(palette[tone.foreground], palette[tone.background]).passes).toBe(true)
    }
  })

  it('records why the *-container family was rejected for badges', () => {
    // Not a contrast failure — every pair clears 4.5:1. The failure is tonal: two of the
    // three are dark-background chips and one is light, so a single table column would
    // invert between rows. See 22-design-system.md §Semantic mapping.
    const containerBadges: readonly [PaletteToken, PaletteToken][] = [
      ['on-tertiary-container', 'tertiary-container'],
      ['on-secondary-container', 'secondary-container'],
      ['on-primary-container', 'primary-container'],
    ]

    const backgroundsAreLight = containerBadges.map(
      ([, background]) => relativeLuminance(palette[background]) > 0.5,
    )

    expect(backgroundsAreLight).toEqual([false, true, false])
  })
})
