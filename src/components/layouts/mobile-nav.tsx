'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Link } from '@/i18n/navigation'

import type { NavItem } from './nav-items'

/** The drawer behind the hamburger below 900px. */
export function MobileNav({
  items,
  namespace,
  title,
}: {
  items: readonly NavItem[]
  namespace: 'public' | 'customer' | 'manufacturer' | 'admin'
  title: string
}) {
  const t = useTranslations(`nav.${namespace}`)
  const common = useTranslations('common')
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={common('menu')} className="md:hidden">
          <Icon name="menu" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" closeLabel={common('close')}>
        <SheetTitle className="pb-md pr-11">{title}</SheetTitle>
        <ul className="flex flex-col gap-xs">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center gap-sm rounded-sm px-sm text-body-md hover:bg-panel-subtle"
              >
                <Icon name={item.icon} dense className="text-muted" />
                {t(item.labelKey)}
              </Link>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
