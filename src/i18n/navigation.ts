import { createNavigation } from 'next-intl/navigation'

import { routing } from './routing'

/**
 * Locale-aware replacements for `next/link` and the navigation hooks. Application code
 * imports these, never `next/link` directly, or the `en` prefix is lost on navigation.
 */
export const { Link, redirect, permanentRedirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
