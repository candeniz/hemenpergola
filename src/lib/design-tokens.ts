import type { ContrastRequirement } from './contrast'

/**
 * A TypeScript mirror of the palette in `src/app/[locale]/globals.css`, used by
 * `/dev/tokens` to render swatches and compute contrast.
 *
 * The duplication is deliberate and guarded: `design-tokens.test.ts` parses `globals.css`
 * and fails if any value here disagrees with the stylesheet. Tailwind 4 keeps the tokens in
 * CSS, and CSS cannot do contrast maths.
 */
export const palette = {
  primary: '#162839',
  'on-primary': '#ffffff',
  'primary-container': '#2c3e50',
  'on-primary-container': '#96a9be',

  secondary: '#006d37',
  'on-secondary': '#ffffff',
  'secondary-container': '#7bf8a1',
  'on-secondary-container': '#007239',

  tertiary: '#411d00',
  'on-tertiary': '#ffffff',
  'tertiary-container': '#612f00',
  'on-tertiary-container': '#f78b30',

  error: '#ba1a1a',
  'on-error': '#ffffff',
  'error-container': '#ffdad6',
  'on-error-container': '#93000a',

  background: '#f8f9fa',
  'on-background': '#191c1d',
  surface: '#f8f9fa',
  'on-surface': '#191c1d',
  'surface-variant': '#e1e3e4',
  'on-surface-variant': '#43474c',
  'surface-container-lowest': '#ffffff',
  'surface-container-low': '#f3f4f5',
  'surface-container': '#edeeef',
  'surface-container-high': '#e7e8e9',
  'surface-container-highest': '#e1e3e4',
  'surface-dim': '#d9dadb',
  'surface-bright': '#f8f9fa',

  outline: '#74777d',
  'outline-variant': '#c4c6cd',
  'inverse-surface': '#2e3132',
  'inverse-on-surface': '#f0f1f2',
  'inverse-primary': '#b5c8df',
  'surface-tint': '#4e6073',

  'primary-fixed': '#d1e4fb',
  'primary-fixed-dim': '#b5c8df',
  'on-primary-fixed': '#091d2e',
  'on-primary-fixed-variant': '#36485b',
  'secondary-fixed': '#7efba4',
  'secondary-fixed-dim': '#61de8a',
  'on-secondary-fixed': '#00210c',
  'on-secondary-fixed-variant': '#005228',
  'tertiary-fixed': '#ffdcc5',
  'tertiary-fixed-dim': '#ffb783',
  'on-tertiary-fixed': '#301400',
  'on-tertiary-fixed-variant': '#713700',

  // Interaction states. These are the only two values in the system that are not lifted
  // straight from the theme file, so their derivation is recorded here and in globals.css:
  // brightness(1.1) applied to the resting fill, which is the effect
  // `customer_dashboard_final` renders as `hover:brightness-110`.
  'confirm-hover': '#00783d',
  'destructive-hover': '#cd1d1d',
} as const satisfies Record<string, string>

export type PaletteToken = keyof typeof palette

/** 22 §Semantic mapping — the only names application code uses. */
export const semanticTokens: readonly { name: string; token: PaletteToken; use: string }[] = [
  { name: 'page', token: 'background', use: 'page background' },
  { name: 'panel', token: 'surface-container-lowest', use: 'card / panel' },
  { name: 'panel-subtle', token: 'surface-container-low', use: 'subtle panel, table header' },
  { name: 'action', token: 'primary', use: 'primary action, headers, structural chrome' },
  { name: 'confirm', token: 'secondary', use: 'success, confirm, marketing CTA' },
  { name: 'destructive', token: 'error', use: 'destructive' },
  { name: 'muted', token: 'on-surface-variant', use: 'muted text' },
  { name: 'divider', token: 'outline-variant', use: 'decorative divider' },
  { name: 'control-border', token: 'outline', use: 'boundary that identifies a control' },
  { name: 'action-hover', token: 'primary-container', use: 'primary fill, hovered' },
  { name: 'confirm-hover', token: 'confirm-hover', use: 'confirm fill, hovered' },
  { name: 'destructive-hover', token: 'destructive-hover', use: 'destructive fill, hovered' },
  { name: 'action-wash', token: 'primary-fixed', use: 'outline button hover, avatar fallback' },
  { name: 'panel-hover', token: 'surface-variant', use: 'row, menu item and ghost hover' },
  { name: 'track', token: 'surface-container-high', use: 'progress track, skeleton, switch off' },
  { name: 'inverse', token: 'inverse-surface', use: 'admin chrome, tooltip, scrim' },
  { name: 'inverse-hover', token: 'primary-container', use: 'admin nav item, hovered' },
]

/** 22 §Semantic mapping, status badges — the `*-fixed` family from the `_final` screens. */
export const statusTones: readonly {
  tone: 'new' | 'progress' | 'waiting' | 'neutral' | 'cancelled'
  background: PaletteToken
  foreground: PaletteToken
  statuses: string
}[] = [
  {
    tone: 'new',
    background: 'secondary-fixed',
    foreground: 'on-secondary-fixed-variant',
    statuses: 'PENDING · ACCEPTED · OFFER_ACCEPTED · WON',
  },
  {
    tone: 'progress',
    background: 'primary-fixed',
    foreground: 'on-primary-fixed-variant',
    statuses: 'OFFER_SENT · SURVEY_COMPLETED',
  },
  {
    tone: 'waiting',
    background: 'tertiary-fixed',
    foreground: 'on-tertiary-fixed-variant',
    statuses: 'SURVEY_SCHEDULED',
  },
  {
    tone: 'neutral',
    background: 'surface-container-high',
    foreground: 'on-surface-variant',
    statuses: 'DECLINED · EXPIRED · LOST · CLOSED',
  },
  {
    tone: 'cancelled',
    background: 'error-container',
    foreground: 'on-error-container',
    statuses: 'CANCELLED',
  },
]

/**
 * Every pair the audit measures. Foreground/background are palette tokens; `requirement`
 * says which WCAG threshold applies.
 */
export const contrastPairs: readonly {
  label: string
  foreground: PaletteToken
  background: PaletteToken
  requirement: ContrastRequirement
}[] = [
  // Text on the surfaces it actually sits on
  {
    label: 'body text on page',
    foreground: 'on-surface',
    background: 'background',
    requirement: 'text',
  },
  {
    label: 'body text on panel',
    foreground: 'on-surface',
    background: 'surface-container-lowest',
    requirement: 'text',
  },
  {
    label: 'muted text on page',
    foreground: 'on-surface-variant',
    background: 'background',
    requirement: 'text',
  },
  {
    label: 'muted text on panel',
    foreground: 'on-surface-variant',
    background: 'surface-container-lowest',
    requirement: 'text',
  },
  // Rule 5 names this one as the likeliest failure
  {
    label: 'muted text on subtle panel (Rule 5)',
    foreground: 'on-surface-variant',
    background: 'surface-container-low',
    requirement: 'text',
  },
  {
    label: 'muted text on surface-variant',
    foreground: 'on-surface-variant',
    background: 'surface-variant',
    requirement: 'text',
  },

  // Filled controls
  {
    label: 'button: primary fill',
    foreground: 'on-primary',
    background: 'primary',
    requirement: 'text',
  },
  {
    label: 'button: confirm fill',
    foreground: 'on-secondary',
    background: 'secondary',
    requirement: 'text',
  },
  {
    label: 'button: destructive fill',
    foreground: 'on-error',
    background: 'error',
    requirement: 'text',
  },
  {
    label: 'button: outline label on page',
    foreground: 'primary',
    background: 'background',
    requirement: 'text',
  },
  {
    label: 'button: outline hover fill',
    foreground: 'primary',
    background: 'primary-fixed',
    requirement: 'text',
  },

  // Inverse chrome (admin sidebar)
  {
    label: 'admin sidebar text',
    foreground: 'inverse-on-surface',
    background: 'inverse-surface',
    requirement: 'text',
  },
  {
    label: 'admin sidebar hover',
    foreground: 'inverse-on-surface',
    background: 'primary-container',
    requirement: 'text',
  },

  // Status badges
  {
    label: 'badge: new',
    foreground: 'on-secondary-fixed-variant',
    background: 'secondary-fixed',
    requirement: 'text',
  },
  {
    label: 'badge: progress',
    foreground: 'on-primary-fixed-variant',
    background: 'primary-fixed',
    requirement: 'text',
  },
  {
    label: 'badge: waiting',
    foreground: 'on-tertiary-fixed-variant',
    background: 'tertiary-fixed',
    requirement: 'text',
  },
  {
    label: 'badge: neutral',
    foreground: 'on-surface-variant',
    background: 'surface-container-high',
    requirement: 'text',
  },
  {
    label: 'badge: cancelled',
    foreground: 'on-error-container',
    background: 'error-container',
    requirement: 'text',
  },

  // Interaction states — a hover that drops below AA is a hover that hides its own label
  {
    label: 'hover: primary fill',
    foreground: 'on-primary',
    background: 'primary-container',
    requirement: 'text',
  },
  {
    label: 'hover: confirm fill',
    foreground: 'on-secondary',
    background: 'confirm-hover',
    requirement: 'text',
  },
  {
    label: 'hover: destructive fill',
    foreground: 'on-error',
    background: 'destructive-hover',
    requirement: 'text',
  },
  {
    label: 'hover: outline button wash',
    foreground: 'primary',
    background: 'primary-fixed',
    requirement: 'text',
  },
  {
    label: 'hover: row / ghost / menu item',
    foreground: 'on-surface',
    background: 'surface-variant',
    requirement: 'text',
  },
  {
    label: 'hover: muted label on a hovered row',
    foreground: 'on-surface-variant',
    background: 'surface-variant',
    requirement: 'text',
  },
  {
    label: 'hover: admin nav item',
    foreground: 'inverse-on-surface',
    background: 'primary-container',
    requirement: 'text',
  },
  {
    label: 'avatar fallback on action wash',
    foreground: 'on-primary-fixed-variant',
    background: 'primary-fixed',
    requirement: 'text',
  },
  {
    label: 'track on page (inert fill)',
    foreground: 'surface-container-high',
    background: 'background',
    requirement: 'decorative',
  },

  // Boundaries — 3:1 under WCAG 1.4.11
  {
    label: 'control border on page',
    foreground: 'outline',
    background: 'background',
    requirement: 'ui',
  },
  {
    label: 'control border on panel',
    foreground: 'outline',
    background: 'surface-container-lowest',
    requirement: 'ui',
  },
  {
    label: 'focus ring on page',
    foreground: 'primary',
    background: 'background',
    requirement: 'ui',
  },
  // 1.61:1 — far under the 3:1 that WCAG 1.4.11 asks of a boundary that identifies a
  // control. That is why `divider` and `control-border` are two different semantic names:
  // this token may separate rows, and may never outline an input.
  {
    label: 'divider on page (decorative only)',
    foreground: 'outline-variant',
    background: 'background',
    requirement: 'decorative',
  },
  {
    label: 'divider on panel (decorative only)',
    foreground: 'outline-variant',
    background: 'surface-container-lowest',
    requirement: 'decorative',
  },

  // The `*-container` family the doc originally proposed for badges, kept as evidence
  {
    label: 'rejected: container badge PENDING',
    foreground: 'on-tertiary-container',
    background: 'tertiary-container',
    requirement: 'text',
  },
  {
    label: 'rejected: container badge ACCEPTED',
    foreground: 'on-secondary-container',
    background: 'secondary-container',
    requirement: 'text',
  },
  {
    label: 'rejected: container badge OFFER_SENT',
    foreground: 'on-primary-container',
    background: 'primary-container',
    requirement: 'text',
  },
]
