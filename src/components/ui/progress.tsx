import { Progress as ProgressPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * `label` is required, not optional: a progress bar with no accessible name announces
 * itself as "progress bar" and nothing else. The a11y stage caught this on the first run
 * (`aria-progressbar-name`), which is the argument for the stage existing in Phase 0.
 */
export function Progress({
  className,
  value = 0,
  label,
  ...props
}: ComponentProps<typeof ProgressPrimitive.Root> & { label: string }) {
  return (
    <ProgressPrimitive.Root
      aria-label={label}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-track', className)}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 bg-action transition-transform"
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}
