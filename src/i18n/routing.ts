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
})

export type Locale = (typeof routing.locales)[number]
