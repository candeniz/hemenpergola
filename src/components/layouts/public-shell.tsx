import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

import { LocaleSwitcher } from './locale-switcher'
import { MobileNav } from './mobile-nav'
import { publicNav } from './nav-items'

/**
 * The comfortable density (22 §Density): 1200px container, 64px desktop margins, 48/80
 * vertical rhythm. A marketing page as dense as the dashboard reads as cheap.
 *
 * Screen reference: `outdoor_systems_public_homepage_final`.
 */
export function PublicShell({ children }: { children: ReactNode }) {
  const t = useTranslations('nav.public')
  const common = useTranslations('common')
  const brand = useTranslations('brand')

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-md focus:top-md focus:z-50 focus:rounded focus:bg-panel focus:px-md focus:py-base"
      >
        {common('skipToContent')}
      </a>

      <header className="border-b border-divider bg-panel">
        <div className="mx-auto flex h-16 max-w-page items-center gap-md px-margin-mobile md:px-margin-desktop">
          <MobileNav items={publicNav} namespace="public" title={brand('name')} />

          <Link href="/" className="font-heading text-headline-md text-action">
            {brand('name')}
          </Link>

          <nav aria-label={common('menu')} className="hidden md:block">
            <ul className="flex items-center gap-md">
              {publicNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-11 items-center text-body-sm text-muted hover:text-on-page"
                  >
                    {t(item.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-base">
            <LocaleSwitcher className="hidden sm:flex" />
            <Button variant="ghost" size="default" className="hidden sm:inline-flex" asChild>
              <Link href="/giris">{t('signIn')}</Link>
            </Button>
            <Button variant="confirm" size="default" asChild>
              <Link href="/iletisim">{t('contactSales')}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto w-full max-w-page flex-1 px-margin-mobile py-lg md:px-margin-desktop md:py-xl"
      >
        {children}
      </main>

      <footer className="border-t border-divider bg-panel">
        <div className="mx-auto flex max-w-page flex-col gap-xs px-margin-mobile py-lg md:px-margin-desktop">
          <p className="font-heading text-body-lg text-action">{brand('name')}</p>
          <p className="text-body-sm text-muted">{brand('tagline')}</p>
        </div>
      </footer>
    </div>
  )
}
