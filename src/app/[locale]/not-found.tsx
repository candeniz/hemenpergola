import { getTranslations } from 'next-intl/server'

import { Button } from '@/components/ui/button'
import { PublicShell } from '@/components/layouts/public-shell'
import { Link } from '@/i18n/navigation'
import { publicNav } from '@/components/layouts/nav-items'

/**
 * The 404 — `404_page_not_found`, task 14.2.
 *
 * Until now `notFound()` rendered **Next's built-in page**: unbranded, unstyled, and in
 * English whatever the locale. Five pages call it deliberately (`/sehirler/[slug]` for an
 * unsupplied city, `/kategoriler/[slug]`, the three owner-scoped ones), so this was not a
 * hypothetical surface — it was the answer to a supported question, rendered by a stranger.
 *
 * It sits at `[locale]/`, inside the locale layout, which is what gives it the shell, the
 * fonts and the catalogue. A 404 for a path that never reached the locale segment is a
 * different file and a much rarer one — see `app/not-found.tsx`.
 *
 * The onward links come from `publicNav`, not a second list: the footer of a 404 is exactly
 * where a stale copy of the navigation would sit unnoticed.
 */
export default async function NotFound() {
  const t = await getTranslations('errors.notFound')
  const nav = await getTranslations('nav.public')

  return (
    <PublicShell>
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-md py-xl text-center">
        {/*
         * A pergola frame with one beam missing — the design's illustration, drawn in
         * tokens rather than fetched. Decorative, so it is hidden from assistive tech:
         * the headline below says everything it says.
         */}
        <svg
          aria-hidden
          viewBox="0 0 180 110"
          className="h-28 w-44 text-divider"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M10 22h160" />
          <path d="M40 22v10M70 22v10M130 22v10" />
          <path d="M18 22v78M162 22v78" />
          <path d="M96 22v10" className="text-destructive" strokeDasharray="4 5" />
        </svg>

        <h1 className="text-headline-lg text-on-page">{t('title')}</h1>
        <p className="text-body-lg text-muted">{t('body')}</p>

        <div className="flex flex-col gap-base sm:flex-row">
          <Button asChild variant="primary" size="touch">
            <Link href="/">{t('home')}</Link>
          </Button>
          <Button asChild variant="outline" size="touch">
            <Link href="/kategoriler">{t('browse')}</Link>
          </Button>
        </div>

        <nav aria-label={t('elsewhere')} className="w-full border-t border-divider pt-md">
          <ul className="flex flex-wrap items-center justify-center gap-md">
            {publicNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-body-md text-muted hover:underline">
                  {nav(item.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </PublicShell>
  )
}
