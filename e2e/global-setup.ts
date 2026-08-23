/**
 * Runs once before the suite.
 *
 * **Fresh rate-limit windows.** The auth surface allows 10 attempts / 15 min per IP
 * (`06` §Rate limits), and the suite's legitimate logins and registrations spend almost
 * exactly that. The windows live in `RateLimitHit` rows, so two local runs inside fifteen
 * minutes stack onto one window and the second fails on logins that are correct — which
 * reads as an auth regression and is actually the previous run's budget.
 *
 * Clearing the table here gives each run the same fresh window CI gets from a fresh
 * database. It does not weaken the limit *inside* a run: every attempt still counts, and a
 * spec that overspends still fails.
 */
export default async function globalSetup(): Promise<void> {
  const { Client } = await import('pg')

  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ?? 'postgresql://pergola:pergola@localhost:5432/pergola',
  })

  await client.connect()
  try {
    await client.query('TRUNCATE TABLE "RateLimitHit"')
  } finally {
    await client.end()
  }
}
