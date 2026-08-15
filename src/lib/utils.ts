import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge has to be taught the token scales from `globals.css`, or it mis-sorts
 * every custom utility into the wrong conflict group. Two failures it produces otherwise,
 * both silent:
 *
 *   twMerge('text-body-sm', 'text-muted')  → 'text-muted'
 *       `text-body-sm` looks like a colour, so the entire type scale is dropped wherever a
 *       component sets a size and a colour in the same call — which is nearly everywhere.
 *
 *   twMerge('px-md', 'px-sm')              → 'px-md px-sm'
 *       Neither is recognised as spacing, so the conflict is never resolved and the winner
 *       is decided by stylesheet order rather than by the call site.
 *
 * Declaring the scales here fixes both. Adding a token to `globals.css` means adding it
 * here too; `utils.test.ts` fails when the two disagree.
 */
export const FONT_SIZE_TOKENS = [
  'display-lg',
  'headline-lg',
  'headline-lg-mobile',
  'headline-md',
  'body-lg',
  'body-md',
  'body-sm',
  'label-md',
] as const

export const SPACING_TOKENS = [
  'xs',
  'base',
  'sm',
  'md',
  'lg',
  'xl',
  'gutter',
  'margin-mobile',
  'margin-desktop',
  'row',
] as const

export const CONTAINER_TOKENS = ['page', 'drawer', 'drawer-max'] as const

export const SHADOW_TOKENS = ['ambient'] as const

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [...FONT_SIZE_TOKENS],
      spacing: [...SPACING_TOKENS],
      container: [...CONTAINER_TOKENS],
      shadow: [...SHADOW_TOKENS],
    },
  },
})

/** Merge conditional class names, letting later Tailwind utilities win. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
