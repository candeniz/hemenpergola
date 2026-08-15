import type { Metadata } from 'next'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Inter, Montserrat } from 'next/font/google'
import localFont from 'next/font/local'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { routing } from '@/i18n/routing'

import './globals.css'

/**
 * Fonts are self-hosted: `next/font/google` downloads and serves them from our own origin,
 * so no request ever reaches Google at runtime. `latin-ext` is what carries the Turkish
 * glyphs (ğ İ ı ş ç ö ü) — without it they fall back mid-render (22 §Typography).
 */
const montserrat = Montserrat({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700'],
  variable: '--font-montserrat',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
})

/** Material Symbols Outlined, subsetted to the icons in use — see fonts/README.md. */
const materialSymbols = localFont({
  src: './fonts/material-symbols-outlined-subset.woff2',
  variable: '--font-material-symbols',
  display: 'block', // an icon that flashes as its ligature text is worse than a brief gap
  weight: '400',
})

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'brand' })

  return {
    title: t('name'),
    description: t('tagline'),
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  return (
    <html
      lang={locale}
      className={`${montserrat.variable} ${inter.variable} ${materialSymbols.variable}`}
    >
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
