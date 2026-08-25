/**
 * The message namespaces that ship to the BROWSER — Phase 8's gate work. The layout used
 * to hand `NextIntlClientProvider` the whole catalogue, which serialised every namespace
 * (admin screens included) into every public page's flight payload: ~70 KB of JSON on the
 * homepage, paid again at hydration. Only client components need client messages; server
 * components read the catalogue on the server.
 *
 * The list is defended, not remembered: `client-namespaces.test.ts` scans every
 * `'use client'` file for `useTranslations('…')` and fails if a namespace is used in the
 * browser but missing here — the failure names the file. Server-only namespaces (home,
 * directory, estimate, brand…) stay off the wire.
 */
export const CLIENT_MESSAGE_NAMESPACES = [
  'admin',
  'adminContent',
  'auth',
  'common',
  'consent',
  // Transitively client: estimate-band.tsx carries no 'use client' of its own but is
  // rendered by match-results.tsx (client) — the scan below follows one import hop for
  // exactly this case, which the first draft missed and the release gate caught.
  'estimate',
  'leads',
  'messaging',
  'nav',
  'pricing',
  'privacy',
  'projects',
  'requests',
  'results',
  'reviews',
  'shell',
  'supply',
  'wizard',
] as const

export function pickClientMessages<T extends Record<string, unknown>>(messages: T): Partial<T> {
  const picked: Partial<T> = {}
  for (const namespace of CLIENT_MESSAGE_NAMESPACES) {
    if (namespace in messages) picked[namespace as keyof T] = messages[namespace as keyof T]
  }
  return picked
}
