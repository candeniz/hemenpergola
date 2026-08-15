import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

import { buttonVariants } from './button'
import { Icon } from './icon'

export function Pagination({ className, ...props }: ComponentProps<'nav'>) {
  return <nav className={cn('flex w-full justify-center', className)} {...props} />
}

export function PaginationContent({ className, ...props }: ComponentProps<'ul'>) {
  return <ul className={cn('flex flex-row items-center gap-xs', className)} {...props} />
}

export function PaginationItem(props: ComponentProps<'li'>) {
  return <li {...props} />
}

export function PaginationLink({
  className,
  isActive = false,
  ...props
}: ComponentProps<'a'> & { isActive?: boolean }) {
  return (
    <a
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        buttonVariants({ variant: isActive ? 'primary' : 'ghost', size: 'icon' }),
        className,
      )}
      {...props}
    />
  )
}

export function PaginationPrevious({ label, ...props }: ComponentProps<'a'> & { label: string }) {
  return (
    <PaginationLink aria-label={label} {...props}>
      <Icon name="chevron_left" />
    </PaginationLink>
  )
}

export function PaginationNext({ label, ...props }: ComponentProps<'a'> & { label: string }) {
  return (
    <PaginationLink aria-label={label} {...props}>
      <Icon name="chevron_right" />
    </PaginationLink>
  )
}
