'use client'

import { Dialog as DialogPrimitive } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

import { Icon } from './icon'

/** A Sheet is a Dialog anchored to an edge — used for the mobile navigation drawer. */
export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

const sheetVariants = cva('fixed z-50 bg-panel shadow-ambient transition-transform', {
  variants: {
    side: {
      left: 'inset-y-0 left-0 h-full w-drawer max-w-drawer-max',
      right: 'inset-y-0 right-0 h-full w-drawer max-w-drawer-max',
      top: 'inset-x-0 top-0 h-auto',
      bottom: 'inset-x-0 bottom-0 h-auto',
    },
  },
  defaultVariants: { side: 'left' },
})

export function SheetContent({
  className,
  children,
  side,
  closeLabel,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof sheetVariants> & { closeLabel: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-inverse-surface/40" />
      <DialogPrimitive.Content
        className={cn(sheetVariants({ side }), 'p-md', className)}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-sm top-sm inline-flex size-11 items-center justify-center rounded-sm text-muted hover:bg-panel-subtle"
          aria-label={closeLabel}
        >
          <Icon name="close" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title className={cn('font-heading text-headline-md', className)} {...props} />
  )
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn('text-body-sm text-muted', className)} {...props} />
  )
}
