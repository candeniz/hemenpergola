import 'server-only'

import { appendFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { env } from '@/shared/config/env'

/**
 * The `Mailer` port (`05-system-architecture.md` §Ports and adapters).
 *
 * One of four things behind an interface, because deliverability providers change. The
 * adapter is chosen by `MAIL_PROVIDER`; `log` is the development default and is refused in
 * production by the env schema, so shipping without a real provider is a startup failure
 * rather than silent mail loss.
 */
export type Email = {
  to: string
  subject: string
  /** `13-notifications.md` §Templates: every template has a plain-text part. */
  text: string
  html?: string
}

export type Mailer = {
  readonly name: string
  send(email: Email): Promise<void>
}

/**
 * The last few messages the log adapter handled, newest last — read by `/api/dev/mailbox`
 * so a developer, and the end-to-end suite, can follow a verification link without running a
 * mail server. It holds nothing that is not already on stdout, and the endpoint that exposes
 * it refuses to exist outside development.
 *
 * **A file, not memory.** Two rounds of getting this wrong are worth recording, because the
 * wrong versions look more correct than this one:
 *
 *   A module-scope `const recent: Email[] = []` is a *different array* in each route's
 *   server bundle, so the mailbox read by the route handler never sees what the server
 *   action wrote. It returns an empty list, forever, with no error.
 *
 *   Parking it on `globalThis` — the trick that makes the Prisma client a singleton — fixes
 *   that and still fails, intermittently: `next start` serves requests from more than one
 *   process, so the mail lands in whichever worker handled the action and the read goes to
 *   whichever worker handled the GET. It passed a whole suite run and failed the next.
 *
 * A file in the OS temp directory is shared by every worker, survives a restart, and is
 * exactly as disposable as the thing it holds.
 */
const RECENT_LIMIT = 50

function mailboxPath(): string {
  return join(tmpdir(), 'pergola-dev-mailbox.jsonl')
}

export function recentMail(): readonly Email[] {
  try {
    return readFileSync(mailboxPath(), 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .slice(-RECENT_LIMIT)
      .map((line) => JSON.parse(line) as Email)
  } catch {
    // No file yet means no mail yet.
    return []
  }
}

/**
 * The log adapter. Writes the whole message to stdout, including the link, so a developer
 * can complete an email-verification flow without a mail server.
 */
export const logMailer: Mailer = {
  name: 'log',
  async send(email) {
    try {
      appendFileSync(mailboxPath(), `${JSON.stringify(email)}\n`, 'utf8')
    } catch (error) {
      // The buffer is a convenience; stdout below is the actual log, and losing the
      // convenience must not lose the mail.
      console.error('[mail] could not record to the dev mailbox', error)
    }

    console.info(
      [
        '',
        '─── mail ───────────────────────────────',
        `to:      ${email.to}`,
        `subject: ${email.subject}`,
        '',
        email.text,
        '────────────────────────────────────────',
        '',
      ].join('\n'),
    )
  },
}

let mailer: Mailer | undefined

export function getMailer(): Mailer {
  if (mailer !== undefined) return mailer

  switch (env.MAIL_PROVIDER) {
    case 'log':
      mailer = logMailer
      return mailer
    default:
      // Resend and SMTP adapters land when a provider is chosen; the env schema already
      // requires MAIL_API_KEY for anything that is not `log`.
      throw new Error(`No adapter for MAIL_PROVIDER=${env.MAIL_PROVIDER}`)
  }
}

/** Tests install a recording fake. */
export function setMailer(next: Mailer): void {
  mailer = next
}
