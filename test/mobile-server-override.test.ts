import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Task 13.4 — **the runtime server-address override is a test-build feature, and this is
 * the test that keeps it one.**
 *
 * A `preview` APK may be retargeted at a new tunnel address from a field on the sign-in
 * screen (`mobile/src/api/server-address.ts`), which is what turns "rebuild the APK every
 * session" into "build it once". The same field in a store build would let anyone point the
 * app at a server of their choosing and hand it their credentials — so the rule is not
 * "usually off", it is **off in production, by construction**.
 *
 * Nothing else can assert that. Root ESLint ignores `mobile/`, the mobile package has no
 * test runner, and the flag's off state is *the absence of a line* in a JSON file — the
 * single easiest thing in this repository to add by accident and never notice.
 */

const MOBILE = join(process.cwd(), 'mobile')
const FLAG = 'EXPO_PUBLIC_ALLOW_SERVER_OVERRIDE'

type BuildProfile = { env?: Record<string, string> }
const easProfiles = (): Record<string, BuildProfile> =>
  (
    JSON.parse(readFileSync(join(MOBILE, 'eas.json'), 'utf8')) as {
      build: Record<string, BuildProfile>
    }
  ).build

const read = (...segments: string[]): string => readFileSync(join(MOBILE, ...segments), 'utf8')

describe('13.4 · the server-address override never reaches a store build', () => {
  it('the production profile does not set the flag', () => {
    const production = easProfiles().production
    expect(production).toBeDefined()
    expect(production?.env?.[FLAG]).toBeUndefined()
  })

  it('the test profiles DO set it — the promise in TEST-APK.md is real', () => {
    const profiles = easProfiles()
    expect(profiles.preview?.env?.[FLAG]).toBe('1')
    expect(profiles.development?.env?.[FLAG]).toBe('1')
  })

  it('the gate is the profile flag, not `__DEV__`', () => {
    const source = read('src', 'api', 'server-address.ts')
    // Comments stripped first: the file *discusses* `__DEV__` at length, and a rule that
    // cannot tell prose from code would force the explanation out of the file it explains.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

    // `__DEV__` is false in a release bundle, so it would switch the field OFF on the one
    // build that needs it — and its inverse would open it in production. Neither is the
    // rule, so neither may be the implementation.
    expect(code).not.toMatch(/__DEV__/)
    expect(code).toContain(`process.env.${FLAG} === '1'`)
  })

  it('the API client reads the address through that one door', () => {
    // Two readers of the same setting is how one of them goes stale — and the stale one
    // here would silently keep talking to the compiled-in address.
    const client = read('src', 'api', 'client.ts')
    expect(client).toContain('getBaseUrl')
    expect(client).not.toContain('EXPO_PUBLIC_API_URL')
  })
})
