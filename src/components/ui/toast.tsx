'use client'

import { Toaster as Sonner, type ToasterProps } from 'sonner'

/**
 * Toasts are tokenised through `toastOptions.classNames` rather than sonner's own theme,
 * so no colour is decided at a call site (22 §Component base).
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="font-body"
      toastOptions={{
        classNames: {
          toast: 'rounded border border-divider bg-panel text-on-panel shadow-ambient',
          title: 'text-body-sm font-medium',
          description: 'text-body-sm text-muted',
          actionButton: 'rounded bg-action text-on-action',
          cancelButton: 'rounded bg-panel-subtle text-muted',
          error: 'border-destructive',
          success: 'border-confirm',
        },
      }}
      {...props}
    />
  )
}
