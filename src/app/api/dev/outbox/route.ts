/**
 * `GET /api/dev/outbox` — the messages the `log` SMS adapter has handled.
 *
 * The SMS twin of `/api/dev/mailbox`, and it exists for the same reason: Q3 leaves the
 * platform with no SMS provider, so an OTP has nowhere to arrive, and a developer — or the
 * Phase 2 gate, which has to get a customer through phone verification before it can create
 * a company — needs to read the code from somewhere.
 *
 * **Two independent gates, and both must open.** `APP_ENV` must not be production, and the
 * provider must be `log`. The env schema already refuses `SMS_PROVIDER=log` in production,
 * so in a real deployment there is no buffer to read even if the first gate were bypassed.
 * Anything else 404s — not 403, because a 403 confirms the endpoint exists.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const [{ env }, { recentSms }] = await Promise.all([
    import('@/shared/config/env'),
    import('@/modules/notification/infrastructure/sms-sender'),
  ])

  if (env.APP_ENV === 'production' || env.SMS_PROVIDER !== 'log') {
    return new Response('Not found', { status: 404 })
  }

  return Response.json({
    data: recentSms().map((message) => ({
      to: message.to,
      text: message.text,
      // The code is what a caller wants; extracting it here saves every reader a regex.
      code: message.text.match(/\b\d{6}\b/)?.[0] ?? null,
    })),
    meta: { provider: env.SMS_PROVIDER },
  })
}
