import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { use } from 'react'

import { PublicShell } from '@/components/layouts/public-shell'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

/**
 * Home. Layout and copy intent from `outdoor_systems_public_homepage_final`; the category
 * grid and hero imagery arrive in Phase 8 with real catalogue rows behind them
 * (18-cms-seo.md). What is here is the shell, the type scale and the CTA hierarchy.
 */
export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params)
  setRequestLocale(locale)

  return (
    <PublicShell>
      <HomeContent />
    </PublicShell>
  )
}

function HomeContent() {
  const t = useTranslations('home')

  return (
    <div className="flex flex-col gap-xl">
      <section className="flex flex-col gap-md">
        <h1 className="max-w-3xl font-heading text-headline-lg-mobile md:text-display-lg">
          {t('heroTitle')}
        </h1>
        <p className="max-w-2xl text-body-lg text-muted">{t('heroBody')}</p>
        <div>
          <Button variant="confirm" size="touch">
            {t('heroCta')}
            <Icon name="arrow_forward" dense />
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-md">
        <h2 className="font-heading text-headline-md">{t('categoriesTitle')}</h2>
      </section>
    </div>
  )
}
