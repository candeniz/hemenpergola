import 'server-only'

import { env } from '@/shared/config/env'

/**
 * The `SmsSender` port (`05-system-architecture.md` §Ports and adapters).
 *
 * **The port is the whole point** (`26-execution-plan.md` row 1.5). Q3 is still open — a
 * Turkish alphanumeric sender ID is allocated only to an İYS-registered business, which
 * needs the legal entity in Q2 — so there is no provider to call. The log adapter lets
 * phone verification be built and tested now; the real adapter is one file when Q3 clears.
 */
export type Sms = {
  to: string
  text: string
}

export type SmsSender = {
  readonly name: string
  send(message: Sms): Promise<void>
}

/** Prints the code. The only way to complete an OTP flow while Q3 is open. */
export const logSmsSender: SmsSender = {
  name: 'log',
  async send(message) {
    console.info(`─── sms ─── to ${message.to}: ${message.text}`)
  },
}

let sender: SmsSender | undefined

export function getSmsSender(): SmsSender {
  if (sender !== undefined) return sender

  if (env.SMS_PROVIDER === 'log') {
    sender = logSmsSender
    return sender
  }

  throw new Error(`No adapter for SMS_PROVIDER=${env.SMS_PROVIDER} — see Q3 in 25-progress.md`)
}

export function setSmsSender(next: SmsSender): void {
  sender = next
}
