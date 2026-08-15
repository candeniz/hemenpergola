import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * The badge palette is the `*-fixed` token family, taken from the `_final` screens
 * (ADR-012, 22 §Semantic mapping). That family is tonally uniform — every variant is a
 * light container with dark text — which is what lets several badges sit in one table
 * column without one of them inverting.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-xs rounded-sm px-base py-xs text-label-md uppercase',
  {
    variants: {
      tone: {
        new: 'bg-status-new text-on-status-new',
        progress: 'bg-status-progress text-on-status-progress',
        waiting: 'bg-status-waiting text-on-status-waiting',
        neutral: 'bg-status-neutral text-on-status-neutral',
        cancelled: 'bg-status-cancelled text-on-status-cancelled',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

export { badgeVariants }
