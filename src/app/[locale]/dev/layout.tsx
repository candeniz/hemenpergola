import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * `/dev/*` is a development surface — the token sheet and the UI gallery. It is not part of
 * the product and must not be reachable in production, so the gate lives here rather than
 * on every page below it.
 *
 * Two details that are not stylistic:
 *
 * `force-dynamic`, and the env import inside the function rather than at the top of the
 * file. A static `import { env }` runs the configuration parse while Next collects page
 * data — that is *build* time, and it re-coupled `pnpm build` to secrets, which is the
 * exact thing moving the parse to `instrumentation.ts` removed
 * (23-deployment-and-environments.md §Configuration, §Runtime). The CI build job has no
 * `.env` on purpose and caught it. Read configuration when serving, not when compiling.
 */
export const dynamic = 'force-dynamic'

export default async function DevLayout({ children }: { children: ReactNode }) {
  const { env } = await import('@/shared/config/env')

  if (env.APP_ENV === 'production') {
    notFound()
  }

  return children
}
