import { NextResponse } from 'next/server'

/**
 * `23-deployment-and-environments.md` §Pipeline: production deploys are rolling, gated on
 * this endpoint. It checks the three things whose absence makes a running process useless —
 * database connectivity, the applied migration version, and storage reachability — rather
 * than returning 200 because the process is alive.
 *
 * That distinction is not theoretical here: a bad environment leaves `next start` up and
 * answering 500s (`25-progress.md`, task 0.2 findings), so a TCP-only check would call that
 * container healthy. This endpoint is what makes the rolling deploy safe.
 *
 * Thin adapter, per `05-system-architecture.md` §Shape: no Prisma here, no logic here.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  // Imported inside the handler, not at module scope. A static import runs the service's
  // module graph — and therefore the env parse and the Prisma client — while Next collects
  // page data at *build* time, which re-couples `pnpm build` to secrets. Same trap as the
  // `/dev` layout; the CI build job has no `.env` precisely so it keeps catching this
  // (23-deployment-and-environments.md §Configuration, §Runtime).
  const { checkHealth } = await import('@/modules/platform/application/health-service')
  const health = await checkHealth()

  return NextResponse.json(health, {
    status: health.status === 'ok' ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  })
}
