'use client'

import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Link } from '@/i18n/navigation'

/**
 * The error boundary — `unexpected_error`, task 14.2.
 *
 * Before this, an unhandled throw in any Server Component under `[locale]` rendered Next's
 * built-in error page: in production a bare "Application error: a client-side exception has
 * occurred", in English, with no way back. That is the page a real user meets on the worst
 * day, and it was the one surface nobody had designed.
 *
 * **A client component by Next's contract** — an error boundary has to re-render in the
 * browser to offer `reset()`. Its namespace is therefore on the wire
 * (`client-namespaces.ts`), which `client-namespaces.test.ts` enforces.
 *
 * ## What it shows, and what it refuses to show
 *
 * `error.digest` and nothing else. Next replaces the message with a digest in production
 * precisely so a stack trace never reaches a browser, and re-deriving detail from `message`
 * would hand whoever is probing the shape of the failure. The digest is what a support
 * conversation needs: the server log carries it beside the real error.
 *
 * ## Why it does not report the error itself
 *
 * `shared/observability/error-tracker.ts` is `server-only`, and rightly — it is the port a
 * contracted processor will hang from (`19` §Data location, the Q2 chain). Reporting from
 * here would need a **client error endpoint**, which is a surface that accepts arbitrary
 * strings from the internet and therefore needs its own rate limit, its own PII rule and
 * its own decision. Server throws already reach `onRequestError`; throws during client
 * rendering are lost, as they were before this file existed. Logged as Q36.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors.unexpected')

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-md">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-md py-md text-center">
          <span
            aria-hidden
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-error-container text-on-error-container"
          >
            <Icon name="warning" />
          </span>

          <h1 className="text-headline-md text-on-panel">{t('title')}</h1>
          <p className="text-body-md text-muted">{t('body')}</p>

          <div className="flex flex-col gap-base sm:flex-row">
            <Button variant="primary" size="touch" onClick={reset}>
              {t('retry')}
            </Button>
            <Button asChild variant="outline" size="touch">
              <Link href="/">{t('home')}</Link>
            </Button>
          </div>

          {error.digest === undefined ? null : (
            <p className="text-body-sm text-muted">{t('reference', { reference: error.digest })}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
