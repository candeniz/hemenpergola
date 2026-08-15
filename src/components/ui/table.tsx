import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * Data-dense by design: no shadow, light horizontal dividers only, 44px rows in `body-sm`
 * (22 §Density, and the "high-density requirement without visual noise" note in the
 * theme's own component guidance).
 */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-body-sm', className)} {...props} />
    </div>
  )
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('bg-panel-subtle', className)} {...props} />
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('divide-y divide-divider', className)} {...props} />
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr className={cn('h-row transition-colors hover:bg-panel-subtle', className)} {...props} />
  )
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'h-row px-sm text-left align-middle text-label-md uppercase text-muted',
        className,
      )}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-sm py-base align-middle', className)} {...props} />
}

export function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
  return <caption className={cn('mt-sm text-body-sm text-muted', className)} {...props} />
}
