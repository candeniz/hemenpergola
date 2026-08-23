import type { Page } from '@playwright/test'

/**
 * A session **fixture**, shared by the specs whose subject is not signing in.
 *
 * The auth surface allows 10 attempts / 15 min per IP (`06` §Rate limits), and the suite's
 * *real* auth tests — registration, login, reset, the phase-4 gate — legitimately spend
 * most of it. Every additional spec that logs in through the form spends budget on a flow
 * it is not testing, and the twelfth login in a run starts failing whichever auth call
 * comes next — which is how core-flow steps 3–4 briefly broke the phase-4 gate's email
 * verification.
 *
 * So: the session row is written directly — the same opaque-token shape `web-session.ts`
 * writes — and the cookie is set on the context. The gate still runs for real: a wrong or
 * expired token meets `ADR-024`'s redirect like any stranger.
 */
export async function seedSessionCookie(page: Page, email: string): Promise<void> {
  const { Client } = await import('pg')
  const { randomBytes } = await import('node:crypto')

  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ?? 'postgresql://pergola:pergola@localhost:5432/pergola',
  })
  await client.connect()

  try {
    const token = randomBytes(32).toString('base64url')
    const expires = new Date(Date.now() + 60 * 60 * 1000)

    const inserted = await client.query(
      `INSERT INTO "Session" ("id", "sessionToken", "userId", "expires")
       SELECT gen_random_uuid()::text, $1, u."id", $2
       FROM "User" u WHERE u."email" = $3
       RETURNING "sessionToken"`,
      [token, expires, email],
    )

    if (inserted.rowCount !== 1) {
      throw new Error(`no seeded user with email ${email} — run \`pnpm seed demo\` first`)
    }

    await page.context().addCookies([
      {
        name: 'pergola.session',
        value: token,
        url: 'http://127.0.0.1:3100',
        httpOnly: true,
        sameSite: 'Lax',
        expires: Math.floor(expires.getTime() / 1000),
      },
    ])
  } finally {
    await client.end()
  }
}
