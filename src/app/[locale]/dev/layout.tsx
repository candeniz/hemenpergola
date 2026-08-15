import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { env } from '@/shared/config/env'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * `/dev/*` is a development surface: the token sheet and the UI gallery. It is not part of
 * the product and must not be reachable in production, so the gate is here rather than
 * repeated on every page below it.
 */
export default function DevLayout({ children }: { children: ReactNode }) {
  if (env.APP_ENV === 'production') {
    notFound()
  }

  return children
}
