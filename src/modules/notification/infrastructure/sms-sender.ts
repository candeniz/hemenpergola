import 'server-only'

import { appendFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

/**
 * The last few messages, read by `/api/dev/outbox`.
 *
 * A file in the OS temp directory for the same reason the mail buffer is one: Next builds a
 * server bundle per route and `next start` serves from more than one process, so neither a
 * module-scope array nor `globalThis` is shared between the action that sends and the
 * handler that reads. That cost two rounds of intermittent failures in Phase 1; this is the
 * version that worked.
 */
const RECENT_LIMIT = 50

function outboxPath(): string {
  return join(tmpdir(), 'pergola-dev-sms.jsonl')
}

export function recentSms(): readonly Sms[] {
  try {
    return readFileSync(outboxPath(), 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .slice(-RECENT_LIMIT)
      .map((line) => JSON.parse(line) as Sms)
  } catch {
    return []
  }
}

/** Prints the code. The only way to complete an OTP flow while Q3 is open. */
export const logSmsSender: SmsSender = {
  name: 'log',
  async send(message) {
    try {
      appendFileSync(outboxPath(), `${JSON.stringify(message)}\n`, 'utf8')
    } catch (error) {
      console.error('[sms] could not record to the dev outbox', error)
    }

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
