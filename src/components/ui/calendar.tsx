'use client'

import { DayPicker, type DayPickerProps } from 'react-day-picker'

import { cn } from '@/lib/utils'

import { buttonVariants } from './button'

/**
 * Used by the site-survey scheduler (11-offer-request-lifecycle.md §Transition table).
 * Restyled once here; the locale is passed in by the caller so dates read correctly in
 * both catalogues.
 */
export function Calendar({ className, classNames, ...props }: DayPickerProps) {
  return (
    <DayPicker
      className={cn('p-sm', className)}
      classNames={{
        months: 'flex flex-col gap-sm',
        month_caption: 'flex items-center justify-center h-11',
        caption_label: 'text-body-md font-medium',
        nav: 'flex items-center gap-xs',
        button_previous: cn(buttonVariants({ variant: 'ghost', size: 'icon' })),
        button_next: cn(buttonVariants({ variant: 'ghost', size: 'icon' })),
        weekday: 'text-label-md uppercase text-muted',
        day: 'p-0',
        day_button: cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'rounded-sm'),
        selected: 'bg-action text-on-action rounded-sm',
        today: 'border border-control-border rounded-sm',
        outside: 'text-muted opacity-50',
        disabled: 'opacity-40',
        ...classNames,
      }}
      {...props}
    />
  )
}
