import createMiddleware from 'next-intl/middleware'

import { routing } from './i18n/routing'

/**
 * Locale negotiation only. Authentication and authorisation are NOT done here: middleware
 * runs on the edge without database access, and authorisation needs the database
 * (12-authentication-authorization.md §Authorization).
 */
export default createMiddleware(routing)

export const config = {
  // Everything except Next internals, the API surface and files with an extension.
  //
  // The `\\.` must survive into the regex: written as a single backslash in a JS string it
  // collapses to a bare `.`, the group becomes "any path with two or more characters", and
  // every unprefixed Turkish route falls out of the middleware and 404s. Only `/` works,
  // which makes it look like locale routing is fine.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
