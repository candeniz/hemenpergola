import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/** 22 Rule 6: loading states are skeletons matching the final layout, never spinners. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('animate-pulse rounded bg-surface-container-high', className)} {...props} />
  )
}
