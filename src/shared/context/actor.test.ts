import { describe, expect, it } from 'vitest'

import { anonymousActor, isAuthenticated, resolveActor, type ActorContext } from './actor'

const headers = (values: Record<string, string>) => ({
  headers: { get: (name: string) => values[name.toLowerCase()] ?? null },
})

describe('resolveActor', () => {
  it('returns an anonymous context — authentication is Phase 1', async () => {
    const actor = await resolveActor(headers({}))

    expect(actor.userId).toBeNull()
    expect(actor.globalRole).toBeNull()
    expect(actor.companyRole).toBeNull()
    expect(actor.companyStatus).toBeNull()
    expect(isAuthenticated(actor)).toBe(false)
  })

  it('has exactly the eight fields 05 §ActorContext defines', async () => {
    const actor = await resolveActor(headers({}))

    expect(Object.keys(actor).sort()).toEqual([
      'companyId',
      'companyRole',
      'companyStatus',
      'globalRole',
      'ip',
      'locale',
      'userAgent',
      'userId',
    ])
  })

  it('takes companyId from the route, never from anywhere else', async () => {
    const actor = await resolveActor(headers({}), { companyId: 'cmp_123' })
    expect(actor.companyId).toBe('cmp_123')

    // No route segment, no company scope — there is no session fallback to fall back to.
    const unscoped = await resolveActor(headers({}))
    expect(unscoped.companyId).toBeNull()
  })

  it('reads the locale from the route, defaulting to Turkish', async () => {
    expect((await resolveActor(headers({}), { locale: 'en' })).locale).toBe('en')
    expect((await resolveActor(headers({}), { locale: 'tr' })).locale).toBe('tr')
    expect((await resolveActor(headers({}))).locale).toBe('tr')
    // Anything unrecognised falls back rather than propagating a bad locale.
    expect((await resolveActor(headers({}), { locale: 'de' })).locale).toBe('tr')
  })

  it('takes the client IP from the forwarded header, first entry', async () => {
    // These values end up in Consent and AuditLog rows, so "the balancer's IP" is wrong.
    const actor = await resolveActor(
      headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' }),
    )
    expect(actor.ip).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip, then records "unknown" rather than guessing', async () => {
    expect((await resolveActor(headers({ 'x-real-ip': '198.51.100.9' }))).ip).toBe('198.51.100.9')
    expect((await resolveActor(headers({}))).ip).toBe('unknown')
    expect((await resolveActor(headers({ 'x-forwarded-for': '' }))).ip).toBe('unknown')
  })

  it('records the user agent, or "unknown"', async () => {
    expect((await resolveActor(headers({ 'user-agent': 'Mozilla/5.0' }))).userAgent).toBe(
      'Mozilla/5.0',
    )
    expect((await resolveActor(headers({}))).userAgent).toBe('unknown')
  })
})

describe('anonymousActor', () => {
  it('produces the same shape without a request, for jobs and tests', () => {
    const actor: ActorContext = anonymousActor()
    expect(actor.userId).toBeNull()
    expect(actor.locale).toBe('tr')
    expect(actor.ip).toBe('unknown')
  })

  it('accepts overrides, so a test can name the actor it means', () => {
    const actor = anonymousActor({ userId: 'usr_1', globalRole: 'ADMIN', locale: 'en' })
    expect(isAuthenticated(actor)).toBe(true)
    expect(actor.globalRole).toBe('ADMIN')
    expect(actor.locale).toBe('en')
  })
})
