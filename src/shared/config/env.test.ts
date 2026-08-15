import { describe, expect, it, vi } from 'vitest'

import { REQUIRED_SERVER_KEYS, VALID_ENV } from '../../../test/fixtures/env'

import { EnvValidationError, parseServerEnv } from './env'

describe('env', () => {
  it('parses a complete environment', () => {
    const parsed = parseServerEnv({ ...VALID_ENV })

    expect(parsed.APP_ENV).toBe('local')
    expect(parsed.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL)
  })

  it.each(REQUIRED_SERVER_KEYS)('throws when %s is missing', (key) => {
    const source: Record<string, string | undefined> = { ...VALID_ENV }
    delete source[key]

    expect(() => parseServerEnv(source)).toThrowError(EnvValidationError)
    // The message must name the variable, or the failure is not actionable.
    expect(() => parseServerEnv(source)).toThrowError(new RegExp(key))
  })

  it('throws at module load, not at first use', async () => {
    // The real startup path: importing the module is what runs the parse. This is the
    // in-process equivalent of `pnpm dev` failing before it serves anything.
    vi.resetModules()
    const original = process.env.DATABASE_URL
    delete process.env.DATABASE_URL

    try {
      await expect(import('./env')).rejects.toThrowError(/DATABASE_URL/)
    } finally {
      if (original !== undefined) {
        process.env.DATABASE_URL = original
      }
      vi.resetModules()
    }
  })

  it('rejects a malformed value as firmly as a missing one', () => {
    expect(() =>
      parseServerEnv({ ...VALID_ENV, DATABASE_URL: 'mysql://localhost/db' }),
    ).toThrowError(/DATABASE_URL/)
    expect(() => parseServerEnv({ ...VALID_ENV, AUTH_SECRET: 'too-short' })).toThrowError(
      /AUTH_SECRET/,
    )
  })

  it('requires provider credentials as soon as the provider is not the log adapter', () => {
    expect(() => parseServerEnv({ ...VALID_ENV, SMS_PROVIDER: 'some-gateway' })).toThrowError(
      /SMS_API_KEY/,
    )
    expect(() => parseServerEnv({ ...VALID_ENV, MAIL_PROVIDER: 'resend' })).toThrowError(
      /MAIL_API_KEY/,
    )
  })

  it('refuses the log-only adapters in production', () => {
    expect(() =>
      parseServerEnv({
        ...VALID_ENV,
        APP_ENV: 'production',
        SENTRY_DSN: 'https://public@sentry.example.com/1',
      }),
    ).toThrowError(/MAIL_PROVIDER/)
  })

  it('requires an error-tracking DSN once the environment is deployed', () => {
    expect(() =>
      parseServerEnv({
        ...VALID_ENV,
        APP_ENV: 'staging',
      }),
    ).toThrowError(/SENTRY_DSN/)
  })

  it('exposes no NEXT_PUBLIC_ variable through the server env', () => {
    // The compile-time guard is in env.ts (`defineServerVars` types such keys as `never`).
    // This is the runtime corroboration.
    const parsed = parseServerEnv({ ...VALID_ENV })

    expect(Object.keys(parsed).filter((key) => key.startsWith('NEXT_PUBLIC_'))).toEqual([])
  })
})
