import 'server-only'

/**
 * The CAPTCHA port.
 *
 * `12-authentication-authorization.md` §Abuse controls calls for a CAPTCHA after 10 failed
 * logins from one IP. **No provider has been chosen**, and choosing one quietly would be a
 * decision, not an implementation detail: reCAPTCHA and hCaptcha both send data about the
 * visitor to a third party, which under `19-security-and-kvkk.md` is a processor
 * relationship that needs naming in the privacy notice and an agreement behind it.
 *
 * So the port exists and the default adapter refuses. See **Q10** in `25-progress.md`.
 *
 * The port shape is deliberately minimal — a token from the client, a verdict from the
 * server — because that is the shape every provider offers, and picking a wider interface
 * would bake in whichever one was looked at first.
 */
export type CaptchaVerification = {
  passed: boolean
  /** Why it failed, for the audit log. Never shown to the user. */
  detail?: string
}

export type CaptchaProvider = {
  readonly name: string
  /** Is a challenge required at all? A provider may be configured but not yet enforcing. */
  readonly enforcing: boolean
  verify(token: string | null, context: { ip: string }): Promise<CaptchaVerification>
}

/**
 * Development and test adapter: no challenge, everything passes, and it says so.
 *
 * Not silently permissive — `enforcing` is `false`, so a caller can tell the difference
 * between "the challenge passed" and "there is no challenge", and the login path logs the
 * second rather than pretending it is the first.
 */
export const noopCaptchaProvider: CaptchaProvider = {
  name: 'noop',
  enforcing: false,
  async verify() {
    return { passed: true, detail: 'no CAPTCHA provider configured (Q10)' }
  },
}

let provider: CaptchaProvider = noopCaptchaProvider

export function getCaptchaProvider(): CaptchaProvider {
  return provider
}

/** Wired at startup once a provider is chosen; used by tests to install a fake. */
export function setCaptchaProvider(next: CaptchaProvider): void {
  provider = next
}
