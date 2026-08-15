/**
 * A complete, valid environment. Single source of truth for both the Vitest process env
 * (`vitest.config.ts`) and the env tests, so the two cannot drift apart.
 *
 * Mirrors `.env.example`, which mirrors `docker-compose.yml`.
 */
export const VALID_ENV = {
  DATABASE_URL: 'postgresql://pergola:pergola@localhost:5432/pergola?schema=public',
  DIRECT_URL: 'postgresql://pergola:pergola@localhost:5432/pergola?schema=public',

  AUTH_SECRET: 'test-secret-that-is-at-least-32-characters-long',
  AUTH_URL: 'http://localhost:3000',

  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'pergola-local',
  S3_ACCESS_KEY: 'pergola',
  S3_SECRET_KEY: 'pergola-secret',
  CDN_BASE_URL: 'http://localhost:9000/pergola-local',

  MAIL_PROVIDER: 'log',
  MAIL_FROM: 'no-reply@localhost',

  SMS_PROVIDER: 'log',
  SMS_SENDER: 'PERGOLA',

  LOG_LEVEL: 'debug',
  APP_ENV: 'local',

  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
} as const satisfies Record<string, string>

/**
 * Variables with no default and no `.optional()`. Removing any one of them must fail
 * startup — that is what `env.test.ts` proves, one key at a time.
 */
export const REQUIRED_SERVER_KEYS = [
  'DATABASE_URL',
  'DIRECT_URL',
  'AUTH_SECRET',
  'AUTH_URL',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'CDN_BASE_URL',
  'MAIL_PROVIDER',
  'MAIL_FROM',
  'SMS_PROVIDER',
  'SMS_SENDER',
  'LOG_LEVEL',
  'APP_ENV',
] as const satisfies readonly (keyof typeof VALID_ENV)[]
