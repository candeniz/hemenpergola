import { describe, expect, it } from 'vitest'

import { contentSecurityPolicy, storageOrigins, STORAGE_FALLBACK_ORIGIN } from './csp'

/**
 * Task 13.5 — **the production profile does not get the development relaxation.**
 *
 * The policy grew a `NODE_ENV` branch because `next dev`'s eval-based bundle had made every
 * strict surface non-interactive since Phase 9 (the file's own comment carries the
 * `EvalError`). That relaxation is `'unsafe-eval'`, and the entire cost of the decision is
 * that there are now two policies where there was one. This is the test that keeps the
 * second one out of the build that ships.
 *
 * `public-directory.spec.ts` asserts the header a real production server emits; this
 * asserts the function, both ways, without needing a server at all.
 */

const nonce = 'dGVzdC1ub25jZQ=='
const storage = ['https://storage.example.com']

describe('19 §App security · the CSP', () => {
  it('never lets a production strict policy carry unsafe-eval or unsafe-inline scripts', () => {
    const csp = contentSecurityPolicy({ strict: true, nonce, development: false, storage })
    const scriptSrc = /script-src[^;]*/.exec(csp)?.[0] ?? ''

    expect(scriptSrc).toContain(`'nonce-${nonce}'`)
    expect(scriptSrc).toContain(`'strict-dynamic'`)
    // The two keywords that would make the whole nonce arrangement theatre.
    expect(scriptSrc).not.toContain('unsafe-eval')
    expect(scriptSrc).not.toContain('unsafe-inline')
  })

  it('adds unsafe-eval in development, and ONLY unsafe-eval', () => {
    const dev = contentSecurityPolicy({ strict: true, nonce, development: true, storage })
    const production = contentSecurityPolicy({ strict: true, nonce, development: false, storage })

    const scriptSrc = (policy: string): string => /script-src[^;]*/.exec(policy)?.[0] ?? ''
    expect(scriptSrc(dev)).toContain(`'unsafe-eval'`)
    // The nonce still governs inline script in development: the relaxation permits
    // evaluating strings, not injecting <script>.
    expect(scriptSrc(dev)).not.toContain('unsafe-inline')

    // And nothing else moved. Every directive but script-src is byte-identical, so the
    // branch cannot quietly widen img-src or connect-src along the way.
    const withoutScript = (policy: string): string[] =>
      policy
        .split('; ')
        .filter((directive) => !directive.startsWith('script-src'))
        .sort()
    expect(withoutScript(dev)).toEqual(withoutScript(production))
  })

  it('leaves the ISR profile without a script-src in either mode', () => {
    for (const development of [true, false]) {
      const csp = contentSecurityPolicy({ strict: false, nonce, development, storage })
      // A per-request nonce and a cached page are mutually exclusive; the profile omits
      // script-src rather than lying. The dev branch must not invent one.
      expect(csp, `development=${development}`).not.toContain('script-src')
      expect(csp).toContain(`frame-ancestors 'none'`)
    }
  })

  it('names the storage origin in the two directives that decide an upload', () => {
    const csp = contentSecurityPolicy({ strict: true, nonce, development: false, storage })
    expect(/connect-src[^;]*/.exec(csp)?.[0]).toContain(storage[0] as string)
    expect(/img-src[^;]*/.exec(csp)?.[0]).toContain(storage[0] as string)
  })

  it('derives the storage origins from configuration, deduplicated', () => {
    // The vitest environment carries `.env.example`'s values, where the two agree.
    expect(storageOrigins()).toEqual([STORAGE_FALLBACK_ORIGIN])
  })
})
