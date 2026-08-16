import { defineRouting } from 'next-intl/routing'

/**
 * Turkish is the default locale and serves at the root path; English is prefixed
 * (CLAUDE.md §Conventions, 07-frontend-architecture.md §i18n).
 *
 *   /            → tr
 *   /en          → en
 *
 * `localePrefix: 'as-needed'` is what produces that asymmetry.
 */
export const routing = defineRouting({
  locales: ['tr', 'en'],
  defaultLocale: 'tr',
  localePrefix: 'as-needed',

  /*
   * **No `Accept-Language` negotiation** (`ADR-018`).
   *
   * next-intl negotiates by default, which quietly overrides the line above: a browser
   * announcing `en-US` asking for `/kayit` was redirected to `/en/kayit`. An
   * English-configured browser is common in this audience, so the default was sending a
   * large share of Turkish users to the English site from a Turkish URL — and making an
   * unprefixed path mean two different pages to two different crawlers, which `18` §Canonical
   * cannot express in an `hreflang` pair.
   *
   * This does not disable the `NEXT_LOCALE` cookie. A visitor who *chooses* English stays in
   * English; a header their browser sent is not a choice.
   */
  localeDetection: false,
})

export type Locale = (typeof routing.locales)[number]
