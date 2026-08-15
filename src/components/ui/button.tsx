import { Slot } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * The button contract is written down in 22-design-system.md §Component base and is
 * implemented once, here. Call sites choose a variant; they never override a colour.
 *
 *   confirm      green (`secondary`) fill — marketing CTAs and confirmations
 *   primary      navy (`primary`) fill — the primary action inside a portal
 *   outline      navy border on transparent
 *   destructive  `error` fill
 *   ghost/link   chrome-free affordances
 *
 * 8px radius, 16px horizontal padding, 40px height — 36px in the dense shells.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-base whitespace-nowrap',
    'rounded font-body text-body-sm font-medium',
    'transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_.icon]:pointer-events-none',
  ],
  {
    variants: {
      variant: {
        confirm:
          'bg-confirm text-on-confirm hover:bg-secondary-fixed-dim hover:text-on-secondary-fixed',
        primary: 'bg-action text-on-action hover:bg-primary-container',
        outline: 'border border-action bg-transparent text-action hover:bg-primary-fixed',
        destructive: 'bg-destructive text-on-destructive hover:bg-on-error-container',
        ghost: 'bg-transparent text-on-panel hover:bg-panel-subtle',
        link: 'bg-transparent text-action underline-offset-4 hover:underline',
      },
      size: {
        /**
         * 22 §Component base specifies 40px, and 22 Rule 4 requires a 44px minimum touch
         * target. Below the 600px breakpoint the pointer is a finger, so Rule 4 wins;
         * from `sm` up the screens' 40px applies. Measured at 375px on /dev/ui.
         */
        default: 'h-11 px-md sm:h-10',
        /** 36px in the dense shells — again 44px while the pointer is a finger. */
        dense: 'h-11 px-sm sm:h-9',
        /** Always 44px, for the primary call to action on a mobile-first surface. */
        touch: 'h-11 px-md',
        /** Square. 44px on touch, 40px from `sm` up. */
        icon: 'size-11 p-0 sm:size-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render as the child element instead of a `<button>` — for links that look like buttons. */
    asChild?: boolean
  }

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'

  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { buttonVariants }
