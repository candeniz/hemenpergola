import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'

import { routing } from './routing'

/**
 * Resolves the message catalogue for the request's locale. Catalogues are namespaced by
 * module (`common`, `nav`, `dev`, …) so a feature owns its keys
 * (07-frontend-architecture.md §i18n).
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
    timeZone: 'Europe/Istanbul',
  }
})
