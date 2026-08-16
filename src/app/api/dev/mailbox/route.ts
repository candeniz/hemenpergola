/**
 * `GET /api/dev/mailbox` — the messages the `log` mail adapter has handled.
 *
 * A development surface, in the same spirit as `/dev/tokens`: it exists so a developer can
 * click the verification link without running a mail server, and so the end-to-end suite can
 * complete the registration flow (`20-testing-strategy.md` §End to end names a test-only
 * endpoint as the accepted shape for exactly this).
 *
 * **Two independent gates, and both must open.** `APP_ENV` must not be production, and the
 * mail provider must be `log`. The second is the one that matters: the env schema already
 * refuses `MAIL_PROVIDER=log` in production, so in a real deployment there is no buffer to
 * read even if the first gate were somehow bypassed. Anything else 404s — not 403, because
 * a 403 confirms the endpoint exists.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  // `shared/dev-outbox`, not `notification/infrastructure`: `app/` may not reach into a
  // module's infrastructure, statically or dynamically (`05` §Shape). The buffer was never
  // `notification`'s to own — the adapter writes it and development reads it.
  const [{ env }, { recentDevMessages }] = await Promise.all([
    import('@/shared/config/env'),
    import('@/shared/dev-outbox'),
  ])

  if (env.APP_ENV === 'production' || env.MAIL_PROVIDER !== 'log') {
    return new Response('Not found', { status: 404 })
  }

  return Response.json({
    data: recentDevMessages<{ to: string; subject: string; text: string }>('mail').map((email) => ({
      to: email.to,
      subject: email.subject,
      text: email.text,
      // The link is what a caller actually wants; pulling it out here keeps the test from
      // re-implementing a URL parser.
      link: email.text.match(/https?:\/\/\S+/)?.[0] ?? null,
    })),
    meta: { provider: env.MAIL_PROVIDER },
  })
}
