import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Outdoor Systems Marketplace',
  description: 'Phase 0 foundation.',
}

// Turkish is the default locale (CLAUDE.md §Conventions). The `[locale]` segment,
// the route groups and next-intl arrive in task 0.13 — this root layout is a
// placeholder and is expected to be replaced then.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  )
}
