import type { ReactNode } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'

/**
 * The frame every auth screen shares.
 *
 * Screen reference: the `auth_*` set in the Stitch export — a narrow centred card on the
 * public shell, one heading, one supporting line, one column of fields. Copied for layout
 * and hierarchy, not for markup (`CLAUDE.md` §Working with the Stitch designs).
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-form flex-col gap-lg py-xl">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-headline-md">{title}</CardTitle>
          {description === undefined ? null : <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-col gap-md">{children}</CardContent>
      </Card>
      {footer === undefined ? null : (
        <div className="text-center text-body-sm text-muted">{footer}</div>
      )}
    </div>
  )
}

/**
 * The four states every screen owes (`CLAUDE.md` §Definition of done). `AuthNotice` is the
 * error and the empty one; loading is the button's own pending state, and forbidden has its
 * own route.
 */
export function AuthNotice({
  tone,
  title,
  children,
}: {
  tone: 'success' | 'error' | 'info'
  title: string
  children?: ReactNode
}) {
  const icon = tone === 'success' ? 'check_circle' : tone === 'error' ? 'error' : 'info'
  const colour =
    tone === 'success' ? 'text-confirm' : tone === 'error' ? 'text-destructive' : 'text-muted'

  return (
    <div className="flex flex-col gap-base" role={tone === 'error' ? 'alert' : 'status'}>
      <p className={`flex items-center gap-base text-body-md font-medium ${colour}`}>
        <Icon name={icon} dense />
        {title}
      </p>
      {children === undefined ? null : <div className="text-body-sm text-muted">{children}</div>}
    </div>
  )
}
