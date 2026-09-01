import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

export const dynamic = 'force-dynamic'

/**
 * The catch-all that makes the 404 ours — task 14.2.
 *
 * Without it, `[locale]/not-found.tsx` only ever renders for an **explicit** `notFound()`
 * from a page that matched. A path that matches nothing never enters the locale segment at
 * all, so Next falls back to its own built-in page — the bare "404 · This page could not be
 * found", in English, outside the shell. That is what `/bir-sey` rendered until this file
 * existed, and the e2e spec caught it on the first run.
 *
 * A catch-all segment is the lowest-priority match in the App Router, so every real route
 * still wins. Its whole job is to be reached, fail, and hand over to the sibling
 * `not-found.tsx` — which is now inside the locale layout, with the fonts, the shell and
 * the catalogue.
 *
 * `setRequestLocale` before `notFound()` on purpose: the not-found page reads the catalogue,
 * and without the request locale it has none to read.
 */
export default async function CatchAll({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  notFound()
}
