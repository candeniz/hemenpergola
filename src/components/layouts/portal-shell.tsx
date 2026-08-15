import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Icon } from '@/components/ui/icon'
import { Link } from '@/i18n/navigation'

import { LocaleSwitcher } from './locale-switcher'
import { MobileNav } from './mobile-nav'
import { manufacturerNav } from './nav-items'

/**
 * High-density surface (22 §Density): full width, 24px gutters, 8/12 vertical rhythm,
 * 44px table rows. A manufacturer lives in this screen all day and needs rows per screen,
 * not breathing room.
 *
 * Screen reference: `manufacturer_portal_dashboard_final`.
 *
 * Company identity is a placeholder until Phase 1; company scope will come from the route
 * (`/panel/[companyId]`, 12-authentication-authorization.md §Context resolution).
 */
export function PortalShell({ children, title }: { children: ReactNode; title: string }) {
  const t = useTranslations('nav.manufacturer')
  const common = useTranslations('common')
  const shell = useTranslations('shell')

  return (
    <div className="flex min-h-screen bg-page">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-sm focus:top-sm focus:z-50 focus:rounded focus:bg-panel focus:px-sm focus:py-base"
      >
        {common('skipToContent')}
      </a>

      <nav
        aria-label={t('section')}
        className="hidden w-60 shrink-0 flex-col border-r border-divider bg-panel md:flex"
      >
        <div className="flex flex-col gap-0.5 border-b border-divider px-sm py-sm">
          <span className="font-heading text-body-md">{shell('placeholderCompany')}</span>
          <span className="text-label-md uppercase text-muted">{t('section')}</span>
        </div>
        <ul className="flex flex-col gap-0.5 p-base">
          {manufacturerNav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex min-h-11 items-center gap-base rounded-sm px-base text-body-sm text-muted hover:bg-panel-hover hover:text-on-panel"
              >
                <Icon name={item.icon} dense />
                {t(item.labelKey)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-base border-b border-divider bg-panel px-gutter">
          <MobileNav items={manufacturerNav} namespace="manufacturer" title={t('section')} />
          <h1 className="font-heading text-headline-md">{title}</h1>
          <div className="ml-auto flex items-center gap-base">
            <LocaleSwitcher className="hidden sm:flex" />
            <Icon name="notifications" dense className="text-muted" />
            <span className="sr-only">{shell('notifications')}</span>
            <Avatar className="size-8">
              <AvatarFallback className="text-label-md">
                {shell('placeholderUser').slice(0, 1)}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        <main id="main" className="flex flex-1 flex-col gap-sm px-gutter py-sm">
          {children}
        </main>
      </div>
    </div>
  )
}
