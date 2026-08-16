import { getTranslations, setRequestLocale } from 'next-intl/server'

import { UiGallery } from './gallery'

/**
 * `?overlay=dialog|sheet|dropdown|tooltip|select|toast` opens one overlay on load.
 *
 * The reason is `max-w-lg`: every `Dialog` in the application was forty-eight pixels wide
 * from Phase 0 until Phase 1's end-to-end suite noticed, and this gallery did not catch it
 * because it rendered the *trigger*. A closed overlay proves the button exists.
 *
 * The parameter is read here, on the server, and passed down — `useSearchParams` in the
 * client component would need a Suspense boundary for a value the page already has. One
 * overlay at a time, so the scrims do not stack and axe scans a page with exactly one
 * modal on it.
 */
export const OVERLAYS = ['dialog', 'sheet', 'dropdown', 'tooltip', 'select', 'toast'] as const
export type OverlayName = (typeof OVERLAYS)[number]

export default async function UiPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ overlay?: string }>
}) {
  const [{ locale }, { overlay }] = await Promise.all([params, searchParams])
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'dev' })

  const open = OVERLAYS.find((name) => name === overlay) ?? null

  return (
    <main className="mx-auto flex max-w-page flex-col gap-lg px-margin-mobile py-lg md:px-margin-desktop">
      <header className="flex flex-col gap-xs">
        <h1 className="font-heading text-headline-lg">{t('uiTitle')}</h1>
        <p className="text-body-md text-muted">{t('uiBody')}</p>
      </header>
      <UiGallery openOverlay={open} />
    </main>
  )
}
