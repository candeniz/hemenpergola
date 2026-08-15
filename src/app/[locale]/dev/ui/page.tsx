import { getTranslations, setRequestLocale } from 'next-intl/server'

import { UiGallery } from './gallery'

export default async function UiPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'dev' })

  return (
    <main className="mx-auto flex max-w-page flex-col gap-lg px-margin-mobile py-lg md:px-margin-desktop">
      <header className="flex flex-col gap-xs">
        <h1 className="font-heading text-headline-lg">{t('uiTitle')}</h1>
        <p className="text-body-md text-muted">{t('uiBody')}</p>
      </header>
      <UiGallery />
    </main>
  )
}
