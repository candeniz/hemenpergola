import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * Control borders use `control-border` (`outline`), not `divider` (`outline-variant`):
 * a boundary that identifies a control needs 3:1 against the page, and `outline-variant`
 * measures 1.62:1. Measured on /dev/tokens.
 */
export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-11 w-full rounded border border-control-border bg-panel px-sm py-base sm:h-10',
        'text-body-md text-on-panel placeholder:text-muted',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive',
        'file:border-0 file:bg-transparent file:text-body-sm file:font-medium',
        className,
      )}
      {...props}
    />
  )
}
