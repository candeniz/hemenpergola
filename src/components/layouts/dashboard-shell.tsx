import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Icon } from '@/components/ui/icon'
import { Link } from '@/i18n/navigation'

import { LocaleSwitcher } from './locale-switcher'
import { MobileNav } from './mobile-nav'
import { customerNav } from './nav-items'

/**
 * Customer surface. Comfortable density like `PublicShell` — a customer visits their
 * dashboard occasionally and is not reading a data table for a living.
 *
 * Screen reference: `customer_dashboard_final`.
 *
 * The user identity is a placeholder: authentication is Phase 1
 * (12-authentication-authorization.md).
 */
export function DashboardShell({ children, title }: { children: ReactNode; title: string }) {
  const t = useTranslations('nav.customer')
  const common = useTranslations('common')
  const brand = useTranslations('brand')
  const shell = useTranslations('shell')

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-md focus:top-md focus:z-50 focus:rounded focus:bg-panel focus:px-md focus:py-base"
      >
        {common('skipToContent')}
      </a>

      <header className="border-b border-divider bg-panel">
        <div className="mx-auto flex h-16 max-w-page items-center gap-sm px-margin-mobile md:px-margin-desktop">
          <MobileNav items={customerNav} namespace="customer" title={t('section')} />
          <Link href="/" className="font-heading text-headline-md text-action">
            {brand('name')}
          </Link>
          <div className="ml-auto flex items-center gap-base">
            <LocaleSwitcher className="hidden sm:flex" />
            <Icon name="notifications" className="text-muted" />
            <span className="sr-only">{shell('notifications')}</span>
            <Avatar>
              <AvatarFallback>{shell('placeholderUser').slice(0, 1)}</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-page flex-1 gap-lg px-margin-mobile py-lg md:px-margin-desktop">
        <nav aria-label={t('section')} className="hidden w-56 shrink-0 md:block">
          <ul className="flex flex-col gap-xs">
            {customerNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-11 items-center gap-sm rounded px-sm text-body-md text-muted hover:bg-panel-hover hover:text-on-page"
                >
                  <Icon name={item.icon} dense />
                  {t(item.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main" className="flex min-w-0 flex-1 flex-col gap-md">
          <h1 className="font-heading text-headline-lg-mobile md:text-headline-lg">{title}</h1>
          {children}
        </main>
      </div>
    </div>
  )
}
