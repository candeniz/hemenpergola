/**
 * WCAG 2.1 contrast maths. Pure, so /dev/tokens and the test suite compute the same
 * numbers (22-design-system.md Rule 5).
 */

export type ContrastRequirement =
  /** Normal body text — 4.5:1 (WCAG 1.4.3). */
  | 'text'
  /** ≥ 24px, or ≥ 18.66px bold — 3:1 (WCAG 1.4.3). */
  | 'large-text'
  /** Boundaries and icons that identify a control — 3:1 (WCAG 1.4.11). */
  | 'ui'
  /**
   * Purely decorative: carries no information and its absence changes nothing a user must
   * perceive. WCAG sets no threshold (1.4.11 covers what is "required to identify" a
   * component). Measured and shown anyway, because "decorative" must be a decision someone
   * made rather than a label attached to whatever failed.
   */
  | 'decorative'

export const REQUIRED_RATIO: Record<ContrastRequirement, number> = {
  text: 4.5,
  'large-text': 3,
  ui: 3,
  decorative: 0,
}

/** `#rrggbb` → the sRGB channel triplet, 0..1. */
function channels(hex: string): [number, number, number] {
  const value = hex.trim().replace('#', '')

  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`Not a 6-digit hex colour: ${hex}`)
  }

  const read = (offset: number): number =>
    Number.parseInt(value.slice(offset, offset + 2), 16) / 255

  return [read(0), read(2), read(4)]
}

/** Relative luminance, WCAG 2.1 definition. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number]

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Contrast ratio between two colours, 1..21. Order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ]

  return (lighter + 0.05) / (darker + 0.05)
}

export type ContrastResult = {
  ratio: number
  required: number
  passes: boolean
}

export function checkContrast(
  foreground: string,
  background: string,
  requirement: ContrastRequirement = 'text',
): ContrastResult {
  const ratio = contrastRatio(foreground, background)
  const required = REQUIRED_RATIO[requirement]

  return {
    // Truncate rather than round: 4.49 must not present itself as 4.5.
    ratio: Math.floor(ratio * 100) / 100,
    required,
    passes: ratio >= required,
  }
}
