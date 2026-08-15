import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Icon } from '@/components/ui/icon'
import { Link } from '@/i18n/navigation'

import { LocaleSwitcher } from './locale-switcher'
import { MobileNav } from './mobile-nav'
import { adminNav } from './nav-items'

/**
 * Admin surface. Same high-density scale as `PortalShell`, distinguished by the inverse
 * chrome so nobody mistakes the two — an admin acting on the wrong surface is the
 * expensive mistake here.
 *
 * Screen reference: `super_admin_command_center_final`.
 *
 * The four deferred admin screens (plans, subscriptions, invoices, configurator builder)
 * are absent from `adminNav` on purpose — `ADR-010`, `ADR-008`.
 */
export function AdminShell({ children, title }: { children: ReactNode; title: string }) {
  const t = useTranslations('nav.admin')
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
        className="hidden w-60 shrink-0 flex-col bg-inverse text-on-inverse md:flex"
      >
        <div className="flex flex-col gap-0.5 px-sm py-sm">
          <span className="font-heading text-body-md">{t('section')}</span>
          <span className="text-label-md uppercase opacity-70">{shell('placeholderUser')}</span>
        </div>
        <ul className="flex flex-col gap-0.5 p-base">
          {adminNav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex min-h-11 items-center gap-base rounded-sm px-base text-body-sm opacity-80 hover:bg-inverse-hover hover:opacity-100"
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
          <MobileNav items={adminNav} namespace="admin" title={t('section')} />
          <h1 className="font-heading text-headline-md">{title}</h1>
          <div className="ml-auto flex items-center gap-base">
            <LocaleSwitcher className="hidden sm:flex" />
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
