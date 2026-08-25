import { NextResponse, type NextRequest } from 'next/server'

import { respond } from '@/shared/http/respond'

/**
 * `19` §Access / portability, both halves.
 *
 * `POST` **asks** for the export; `GET ?token=` downloads the package it produced. Only the
 * second existed until Phase 10.2, which is a stranger bug than it sounds: the download was
 * built, tested and shipped, and there was no way to reach the thing being downloaded. A
 * user could not exercise their access right at all, from any surface — the service was
 * proven by `privacy.integration.test.ts` and reachable by nobody.
 *
 * A thin adapter (`05` §Shape): token verification, expiry, package building and storage
 * all live in `privacy-service`. Dynamic imports only (non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

/**
 * Ask for an export. The body is empty — the subject is the caller, always
 * (`requestDataExport` is `customer-owned` and scoped by `userId`), so there is no
 * parameter with which to ask for somebody else's data.
 */
export async function POST(request: Request): Promise<Response> {
  const [{ requestDataExport }, { resolveActor }] = await Promise.all([
    import('@/modules/privacy/application/privacy-service'),
    import('@/shared/context/actor'),
  ])

  return respond(await requestDataExport(await resolveActor(request), {}))
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (token === null || token === '') {
    return NextResponse.json({ error: 'token required' }, { status: 400 })
  }

  const [{ downloadDataExport }, { anonymousActor }, { httpStatusFor }] = await Promise.all([
    import('@/modules/privacy/application/privacy-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const format = request.nextUrl.searchParams.get('format') === 'pdf' ? 'pdf' : 'json'
  const result = await downloadDataExport(anonymousActor(), { token, format })
  if (!result.ok) {
    return NextResponse.json({ error: result.error.kind }, { status: httpStatusFor(result.error) })
  }

  return new NextResponse(Buffer.from(result.value.body), {
    headers: {
      'content-type': result.value.mime,
      'content-disposition': `attachment; filename="${result.value.fileName}"`,
      'cache-control': 'no-store',
    },
  })
}
