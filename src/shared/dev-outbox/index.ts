import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * The development record of what the `log` adapters "sent" — read by `/api/dev/mailbox` and
 * `/api/dev/outbox` so a developer, and the end-to-end suite, can follow a verification link
 * or an OTP without running a mail server or paying for SMS.
 *
 * ## Why it lives in `shared/` rather than in `notification/`
 *
 * It used to be two copies of this file inside `notification/infrastructure/` — one in
 * `mailer.ts`, one in `sms-sender.ts` — and the dev routes imported them directly. That is a
 * layering violation (`05` §Shape: `app/` calls application services, never a module's
 * infrastructure), and it was invisible because the imports were dynamic and
 * `no-restricted-imports` cannot see `await import(...)`.
 *
 * Inventing a `notification` service method to launder it would be worse: a dev-only endpoint
 * would acquire an entry in the authorisation matrix, and the matrix is the cleanest mechanism
 * in this project precisely because everything in it is real.
 *
 * The honest reading is that this buffer was never `notification`'s to own. It is a ring the
 * adapter writes and development reads — the same relationship `shared/http` and
 * `shared/context` already have with `app/`. So it moved, the duplication collapsed, and no
 * exemption was needed.
 *
 * ## Why a file, not memory
 *
 * Two rounds of getting this wrong are worth recording, because the wrong versions look more
 * correct than this one:
 *
 *   A module-scope `const recent: Entry[] = []` is a *different array* in each route's server
 *   bundle, so the mailbox read by the route handler never sees what the server action wrote.
 *   It returns an empty list, forever, with no error.
 *
 *   Parking it on `globalThis` — the trick that makes the Prisma client a singleton — fixes
 *   that and still fails, intermittently: `next start` serves requests from more than one
 *   process, so the message lands in whichever worker handled the action and the read goes to
 *   whichever worker handled the `GET`. It passed a whole suite run and failed the next.
 *
 * A file in the OS temp directory is shared by every worker, survives a restart, and is
 * exactly as disposable as the thing it holds.
 */

/** The two channels. One file each, so a mail read never has to filter out SMS. */
export type Channel = 'mail' | 'sms'

/** Newest last, and only the tail is ever read. */
const RECENT_LIMIT = 50

function channelPath(channel: Channel): string {
  return join(tmpdir(), `pergola-dev-${channel}.jsonl`)
}

/**
 * Append one entry. **Never throws**: the buffer is a convenience and stdout is the actual
 * log, so losing the convenience must not lose the message.
 */
export function recordDevMessage(channel: Channel, entry: unknown): void {
  try {
    appendFileSync(channelPath(channel), `${JSON.stringify(entry)}\n`, 'utf8')
  } catch (error) {
    console.error(`[${channel}] could not record to the dev outbox`, error)
  }
}

/** The last `RECENT_LIMIT` entries, oldest first. An absent file means nothing was sent. */
export function recentDevMessages<T>(channel: Channel): readonly T[] {
  try {
    return readFileSync(channelPath(channel), 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .slice(-RECENT_LIMIT)
      .map((line) => JSON.parse(line) as T)
  } catch {
    return []
  }
}
