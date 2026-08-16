import 'server-only'

import { env } from '@/shared/config/env'
import { recentDevMessages, recordDevMessage } from '@/shared/dev-outbox'

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
 * The dev record, so `/api/dev/mailbox` can follow a verification link without a mail
 * server. It holds nothing that is not already on stdout, and the endpoint that exposes it
 * refuses to exist outside development. Mechanics and the two failed designs:
 * `shared/dev-outbox`.
 */
export function recentMail(): readonly Email[] {
  return recentDevMessages<Email>('mail')
}

/**
 * The log adapter. Writes the whole message to stdout, including the link, so a developer
 * can complete an email-verification flow without a mail server.
 */
export const logMailer: Mailer = {
  name: 'log',
  async send(email) {
    recordDevMessage('mail', email)

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
