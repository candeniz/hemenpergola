import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * Tonal elevation first (22 §Spacing, radius, elevation): a card is a `panel` surface on
 * the `page` background, with the single ambient shadow. `density="dense"` swaps to the
 * portal/admin scale — smaller radius, tighter padding, outline instead of shadow.
 */
export function Card({
  className,
  density = 'comfortable',
  ...props
}: ComponentProps<'div'> & { density?: 'comfortable' | 'dense' }) {
  return (
    <div
      className={cn(
        'bg-panel text-on-panel',
        density === 'comfortable'
          ? 'rounded-lg p-md shadow-ambient'
          : 'rounded border border-divider p-sm',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-xs pb-sm', className)} {...props} />
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 className={cn('font-heading text-headline-md', className)} {...props} />
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-body-sm text-muted', className)} {...props} />
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('text-body-md', className)} {...props} />
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-base pt-sm', className)} {...props} />
}
