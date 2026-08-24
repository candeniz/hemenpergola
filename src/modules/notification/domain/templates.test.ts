import { describe, expect, it } from 'vitest'

import * as templates from './templates'

/**
 * The other half of the Phase 7 gate — `21` §Phase 7. The catalogue test covers the 19
 * `Notification` events; this file covers the `auth.*` / verification family in
 * `templates.ts`, which is deliberately OUTSIDE the catalogue (direct security mail, no
 * `Notification` row, no preferences) and happens to be the product's highest-volume
 * email. A gate that says "every notification renders" while the verification email is
 * untested proves less than its name.
 *
 * Completeness is automatic, not hand-counted: every export of `templates.ts` is called
 * with sample arguments by arity, so a new template function enters this test by
 * existing. It fails on an empty subject/body or a template that throws.
 */

const SAMPLE_ARGS = [
  'https://example.com/verify?token=abc123',
  'Ege Pergola',
  'Hemen Pergola',
] as const

describe('auth and verification templates (phase-gate, other half)', () => {
  const exported = Object.entries(templates as Record<string, unknown>).filter(
    (entry): entry is [string, (...args: string[]) => unknown] => typeof entry[1] === 'function',
  )

  it('has the template family at all', () => {
    expect(exported.length).toBeGreaterThanOrEqual(10)
  })

  for (const [name, render] of exported) {
    it(`renders ${name} with a non-empty subject and body`, () => {
      const args: string[] = SAMPLE_ARGS.slice(0, Math.max(render.length, 1))
      const result = render(...args)

      if (typeof result === 'string') {
        // The SMS templates return the message directly.
        expect(result.trim().length).toBeGreaterThan(0)
        return
      }

      const body = result as { subject?: string; text?: string }
      expect(body.subject?.trim().length ?? 0, `${name} subject`).toBeGreaterThan(0)
      expect(body.text?.trim().length ?? 0, `${name} text`).toBeGreaterThan(0)
    })
  }

  it('interpolates its arguments rather than dropping them', () => {
    const verification = templates.emailVerificationEmail(SAMPLE_ARGS[0], SAMPLE_ARGS[2])
    expect(verification.text).toContain(SAMPLE_ARGS[0])
    expect(verification.text).toContain(SAMPLE_ARGS[2])

    const otp = templates.phoneOtpSms('123456', SAMPLE_ARGS[2])
    expect(otp).toContain('123456')
  })
})
