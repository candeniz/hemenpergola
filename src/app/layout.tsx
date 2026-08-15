import type { Metadata } from 'next'
import type { ReactNode } from 'react'

// The brand name is Q1 in 25-progress.md and has five undecided candidates. Its
// documented default is a `{brand}` placeholder everywhere, swapped once — so no
// candidate name is hardcoded here. Becomes an i18n key in task 0.13.
export const metadata: Metadata = {
  title: '{brand}',
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
