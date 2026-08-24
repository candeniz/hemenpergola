import { NextResponse, type NextRequest } from 'next/server'

/**
 * The export download — task 9.1, `19` §Access. A thin adapter (`05` §Shape): the token
 * verification, expiry and storage read all live in `privacy-service.downloadDataExport`;
 * this file maps its Result to HTTP and nothing more. Dynamic imports only
 * (non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

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

  const result = await downloadDataExport(anonymousActor(), { token })
  if (!result.ok) {
    return NextResponse.json({ error: result.error.kind }, { status: httpStatusFor(result.error) })
  }

  return new NextResponse(Buffer.from(result.value.body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${result.value.fileName}"`,
      'cache-control': 'no-store',
    },
  })
}
