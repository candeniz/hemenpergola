import { describe, expect, it, vi } from 'vitest'

import {
  anonymousActor,
  isAuthenticated,
  resolveActor,
  type ActorContext,
  type ActorDependencies,
} from './actor'

/**
 * `12-authentication-authorization.md` §Context resolution — task 1.7.
 *
 * Unit, not integration: the four steps are orchestration, and the two IO calls are
 * injected. What is worth testing here is the *order* and the *decisions*, and those are
 * pure.
 */

const headers = (values: Record<string, string>) => ({
  headers: { get: (name: string) => values[name.toLowerCase()] ?? null },
})

function deps(overrides: Partial<ActorDependencies> = {}): ActorDependencies {
  return {
    identify: async () => null,
    loadMembership: async () => null,
    ...overrides,
  }
}

const asUser = (userId = 'usr_1', globalRole: 'CUSTOMER' | 'ADMIN' = 'CUSTOMER') =>
  deps({ identify: async () => ({ userId, globalRole }) })

describe('resolveActor · step 1, identify', () => {
  it('returns an anonymous context when nobody is signed in', async () => {
    const actor = await resolveActor(headers({}), {}, deps())

    expect(actor.userId).toBeNull()
    expect(actor.globalRole).toBeNull()
    expect(isAuthenticated(actor)).toBe(false)
  })

  /*
   * Nine since `ADR-023`, and the count is asserted rather than the presence of each field so
   * that adding a tenth is a deliberate edit here with a decision behind it. `05`
   * §ActorContext defined eight; the ninth is `anonymousKey`, and the ADR says why an
   * identity belongs in the context rather than in every service's input.
   */
  it('has exactly the nine fields 05 §ActorContext defines', async () => {
    const actor = await resolveActor(headers({}), {}, deps())

    expect(Object.keys(actor).sort()).toEqual([
      'anonymousKey',
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

  describe('the anonymous draft key', () => {
    const KEY = 'q'.repeat(43)

    it('is read from the cookie when nobody is signed in', async () => {
      const actor = await resolveActor(headers({ cookie: `pergola.anon=${KEY}` }), {}, deps())

      expect(actor.anonymousKey).toBe(KEY)
      expect(actor.userId).toBeNull()
    })

    it('survives sign-in, because claiming needs both identities at once', async () => {
      /*
       * `POST /projects/{id}/claim` runs immediately after sign-in and moves a row from the
       * key to the account. Clearing the key here would force the claim endpoint to read the
       * cookie itself — a second identity resolver, which is what this field exists to avoid.
       */
      const actor = await resolveActor(
        headers({ cookie: `pergola.anon=${KEY}` }),
        {},
        asUser('usr_7', 'CUSTOMER'),
      )

      expect(actor.userId).toBe('usr_7')
      expect(actor.anonymousKey).toBe(KEY)
    })

    it('reads the __Host- name too, which is the one production sets', async () => {
      const actor = await resolveActor(
        headers({ cookie: `other=1; __Host-pergola.anon=${KEY}; more=2` }),
        {},
        deps(),
      )

      expect(actor.anonymousKey).toBe(KEY)
    })

    it('treats a malformed value as absent rather than passing it to a where clause', async () => {
      for (const value of ['', 'short', 'a'.repeat(200), 'has spaces in it']) {
        const actor = await resolveActor(headers({ cookie: `pergola.anon=${value}` }), {}, deps())
        expect(actor.anonymousKey, value).toBeNull()
      }
    })

    it('is null when the request carries no cookie header at all', async () => {
      const actor = await resolveActor(headers({}), {}, deps())

      expect(actor.anonymousKey).toBeNull()
    })
  })

  it('carries the identified user through', async () => {
    const actor = await resolveActor(headers({}), {}, asUser('usr_42', 'ADMIN'))

    expect(actor.userId).toBe('usr_42')
    expect(actor.globalRole).toBe('ADMIN')
  })
})

describe('resolveActor · steps 2 and 3, company scope', () => {
  it('takes companyId from the route', async () => {
    const actor = await resolveActor(
      headers({}),
      { companyId: 'cmp_1' },
      deps({
        identify: async () => ({ userId: 'usr_1', globalRole: 'CUSTOMER' }),
        loadMembership: async () => ({ role: 'OWNER', status: 'VERIFIED' }),
      }),
    )

    expect(actor.companyId).toBe('cmp_1')
    expect(actor.companyRole).toBe('OWNER')
    expect(actor.companyStatus).toBe('VERIFIED')
  })

  it('loads the company status alongside the role — capability is role ∩ status', async () => {
    const actor = await resolveActor(
      headers({}),
      { companyId: 'cmp_1' },
      deps({
        identify: async () => ({ userId: 'usr_1', globalRole: 'CUSTOMER' }),
        loadMembership: async () => ({ role: 'ADMIN', status: 'SUSPENDED' }),
      }),
    )

    expect(actor.companyStatus).toBe('SUSPENDED')
  })

  it('leaves the role null when there is no membership, rather than throwing', async () => {
    // The decision belongs to `authorize()`, which turns this into FORBIDDEN — one place
    // decides, and it is the same place for every surface (02 §Enforcement rule).
    const actor = await resolveActor(headers({}), { companyId: 'cmp_other' }, asUser())

    expect(actor.companyId).toBe('cmp_other')
    expect(actor.companyRole).toBeNull()
    expect(actor.companyStatus).toBeNull()
  })

  it('does not look up a membership when the route has no companyId', async () => {
    const loadMembership = vi.fn(async () => ({
      role: 'OWNER' as const,
      status: 'VERIFIED' as const,
    }))
    await resolveActor(
      headers({}),
      {},
      deps({ identify: async () => ({ userId: 'u', globalRole: 'CUSTOMER' }), loadMembership }),
    )

    expect(loadMembership).not.toHaveBeenCalled()
  })

  it('does not look up a membership for an anonymous caller', async () => {
    const loadMembership = vi.fn(async () => ({
      role: 'OWNER' as const,
      status: 'VERIFIED' as const,
    }))
    const actor = await resolveActor(headers({}), { companyId: 'cmp_1' }, deps({ loadMembership }))

    expect(loadMembership).not.toHaveBeenCalled()
    expect(actor.companyRole).toBeNull()
  })
})

describe('two tabs, two companies', () => {
  it('scopes each request by its own path and never by shared state', async () => {
    /*
     * The reason `12` §Context resolution forbids a "current company" in the session.
     *
     * One user, member of two companies, both open. If the active company lived in session
     * state, loading the second tab would rewrite the first tab's scope — and the first tab
     * would keep rendering, now acting on the wrong company. Every request here carries its
     * own `companyId` and resolves independently.
     */
    const memberships: Record<string, { role: 'OWNER' | 'SALES'; status: 'VERIFIED' | 'PENDING' }> =
      {
        cmp_alpha: { role: 'OWNER', status: 'VERIFIED' },
        cmp_beta: { role: 'SALES', status: 'PENDING' },
      }

    const dependencies = deps({
      identify: async () => ({ userId: 'usr_multi', globalRole: 'CUSTOMER' }),
      loadMembership: async (_userId, companyId) => memberships[companyId] ?? null,
    })

    const tabOne = await resolveActor(headers({}), { companyId: 'cmp_alpha' }, dependencies)
    const tabTwo = await resolveActor(headers({}), { companyId: 'cmp_beta' }, dependencies)
    // The first tab makes another request *after* the second tab loaded.
    const tabOneAgain = await resolveActor(headers({}), { companyId: 'cmp_alpha' }, dependencies)

    expect(tabOne.companyRole).toBe('OWNER')
    expect(tabTwo.companyRole).toBe('SALES')
    expect(tabOneAgain.companyRole).toBe('OWNER')
    expect(tabOneAgain.companyStatus).toBe('VERIFIED')

    // And the contexts are independent objects, not views onto one mutable scope.
    expect(tabOne.companyId).not.toBe(tabTwo.companyId)
  })

  it('reflects a revoked membership on the very next request', async () => {
    // No token cache: revocation takes effect immediately, which is the reason `companyId`
    // is not a JWT claim (`12` §Tokens).
    let revoked = false

    const dependencies = deps({
      identify: async () => ({ userId: 'usr_1', globalRole: 'CUSTOMER' }),
      loadMembership: async () => (revoked ? null : { role: 'ADMIN', status: 'VERIFIED' }),
    })

    const before = await resolveActor(headers({}), { companyId: 'cmp_1' }, dependencies)
    expect(before.companyRole).toBe('ADMIN')

    revoked = true

    const after = await resolveActor(headers({}), { companyId: 'cmp_1' }, dependencies)
    expect(after.companyRole).toBeNull()
  })
})

describe('resolveActor · step 4, audit fields', () => {
  it('reads the locale from the route, defaulting to Turkish', async () => {
    expect((await resolveActor(headers({}), { locale: 'en' }, deps())).locale).toBe('en')
    expect((await resolveActor(headers({}), { locale: 'tr' }, deps())).locale).toBe('tr')
    expect((await resolveActor(headers({}), {}, deps())).locale).toBe('tr')
    expect((await resolveActor(headers({}), { locale: 'de' }, deps())).locale).toBe('tr')
  })

  it('takes the client IP from the forwarded header, first entry', async () => {
    const actor = await resolveActor(
      headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' }),
      {},
      deps(),
    )
    expect(actor.ip).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip, then records "unknown" rather than guessing', async () => {
    expect((await resolveActor(headers({ 'x-real-ip': '198.51.100.9' }), {}, deps())).ip).toBe(
      '198.51.100.9',
    )
    expect((await resolveActor(headers({}), {}, deps())).ip).toBe('unknown')
    expect((await resolveActor(headers({ 'x-forwarded-for': '' }), {}, deps())).ip).toBe('unknown')
  })

  it('records the user agent, or "unknown"', async () => {
    expect(
      (await resolveActor(headers({ 'user-agent': 'Mozilla/5.0' }), {}, deps())).userAgent,
    ).toBe('Mozilla/5.0')
    expect((await resolveActor(headers({}), {}, deps())).userAgent).toBe('unknown')
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
  })
})
