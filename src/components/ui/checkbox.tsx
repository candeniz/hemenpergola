'use client'

import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

import { Icon } from './icon'

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'peer size-5 shrink-0 rounded-sm border border-control-border bg-panel',
        // 22 Rule 4: the box stays 20px, the hit area is 44px. Without this the control is
        // a 20px target, which is the smallest thing on any of our surfaces.
        "relative before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
        'data-[state=checked]:border-action data-[state=checked]:bg-action data-[state=checked]:text-on-action',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        <Icon name="check" className="icon-inline" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
