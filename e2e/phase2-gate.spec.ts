import { expect, test, type APIRequestContext } from '@playwright/test'

import { SEED_ADMIN_EMAIL, SEED_PASSWORD } from '../prisma/seed/accounts'

/**
 * The Phase 2 gate — `21-development-roadmap.md`: *"an admin adds a product and its options
 * with no deployment, and verifies a manufacturer."*
 *
 * Both halves, end to end, against a production build.
 *
 * ## Why this drives `/api/v1` rather than clicking the screens
 *
 * The gate is about **capability**, not about a particular button: can an admin change what
 * the platform sells without a deploy, and can an admin make a company matchable. Both
 * surfaces are adapters over the same services (`05` §Two entry points), and the API is the
 * one a scripted caller uses. The screens are covered separately — `a11y.spec.ts` renders
 * `/yonetim/katalog`, `/yonetim/ureticiler` and `/yonetim/denetim`, and the catalogue and
 * verification integration suites drive the same services the forms call.
 *
 * ## Why it provisions its own manufacturer
 *
 * It would be shorter to verify whichever `PENDING` company the seed left lying around. It
 * would also only work once: the second run finds that company already `VERIFIED` and either
 * fails or silently verifies something else. So the spec walks a real manufacturer in —
 * register, verify the email, verify the phone, create the company — which makes the gate
 * re-runnable against any profile, and incidentally proves that path still works.
 *
 * The email and the OTP are read from `/api/dev/mailbox` and `/api/dev/outbox`, both of
 * which 404 outside development (`20` §End to end names a test-only endpoint as the accepted
 * shape for this).
 */

const ADMIN_EMAIL = SEED_ADMIN_EMAIL
const ADMIN_PASSWORD = SEED_PASSWORD
const CUSTOMER_PASSWORD = 'phase2-gate-founder-password'

const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 10_000)}`

type Envelope<T> = { data: T } | { error: { code: string; message: string } }

async function call<T>(
  request: APIRequestContext,
  method: 'get' | 'post',
  path: string,
  options: { body?: unknown; token?: string } = {},
): Promise<Envelope<T>> {
  const headers: Record<string, string> =
    options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }
  const response =
    method === 'get'
      ? await request.get(path, { headers })
      : await request.post(path, { data: options.body ?? {}, headers })

  return (await response.json()) as Envelope<T>
}

function data<T>(envelope: Envelope<T>, what: string): T {
  if ('error' in envelope) {
    throw new Error(`${what}: ${envelope.error.code} — ${envelope.error.message}`)
  }
  return envelope.data
}

async function tokenFor(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const session = data<{ accessToken: string }>(
    await call(request, 'post', '/api/v1/auth/login', { body: { email, password } }),
    `login ${email}`,
  )
  return session.accessToken
}

/** The verification link the platform just emailed, read from the dev mailbox. */
async function tokenFromMail(request: APIRequestContext, address: string): Promise<string> {
  const response = await request.get('/api/dev/mailbox')
  expect(response.ok(), 'the dev mailbox must be reachable in a development build').toBe(true)

  const body = (await response.json()) as { data: { to: string; link: string | null }[] }
  const mail = [...body.data].reverse().find((message) => message.to === address)

  expect(mail?.link, `no link mailed to ${address}`).toBeTruthy()
  return new URL(mail?.link ?? '').searchParams.get('token') ?? ''
}

/** The OTP the platform just "sent", read from the dev outbox. Q3 leaves no real channel. */
async function codeFromSms(request: APIRequestContext, phone: string): Promise<string> {
  const response = await request.get('/api/dev/outbox')
  expect(response.ok(), 'the dev SMS outbox must be reachable in a development build').toBe(true)

  const body = (await response.json()) as { data: { to: string; code: string | null }[] }
  const message = [...body.data].reverse().find((entry) => entry.to === phone)

  expect(message?.code, `no code sent to ${phone}`).toBeTruthy()
  return message?.code ?? ''
}

/**
 * **What the gate creates, the gate removes** — task 14.4.
 *
 * This spec verifies a company through the real API, which is the whole point: the gate is
 * *"an admin verifies a manufacturer"*, and a fixture that plants a `VERIFIED` row proves
 * nothing about the flow. What it also did was leave the company behind, and a verified
 * company is **public** — eight `Gate Pergola <timestamp>` cards had accumulated in
 * `/ureticiler` on the demo database, none of them able to quote anyone.
 *
 * So the flow stays real and the cleanup is a separate step. It runs on `afterAll` rather
 * than inside the test so a failing assertion still tidies up: a red test that also poisons
 * the next run is two problems.
 *
 * It deletes **only what this file made**, matched on the run stamps it generated — never a
 * `LIKE 'Gate Pergola%'` sweep, which would also take a company someone created by hand
 * while debugging.
 */
const created: { companyIds: string[]; userEmails: string[] } = { companyIds: [], userEmails: [] }

async function pgExec(sql: string, params: unknown[]): Promise<void> {
  const { Client } = await import('pg')
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ?? 'postgresql://pergola:pergola@localhost:5432/pergola',
  })
  await client.connect()
  try {
    await client.query(sql, params)
  } finally {
    await client.end()
  }
}

test.afterAll(async () => {
  if (created.companyIds.length > 0) {
    // Memberships and documents cascade from `Company`; anything that would `Restrict` —
    // an offer request, a price book — this spec never creates.
    await pgExec(`DELETE FROM "Company" WHERE "id" = ANY($1::text[])`, [created.companyIds])
  }
  if (created.userEmails.length > 0) {
    await pgExec(`DELETE FROM "User" WHERE "email" = ANY($1::text[])`, [created.userEmails])
  }
})

test.describe('Phase 2 gate', () => {
  test.setTimeout(180_000)

  // Argon2id at 19 MiB plus a full registration flow; a distinct client address per test so
  // `06` §Rate limits does not refuse the third one.
  test.beforeEach(async ({ page }, testInfo) => {
    await page.setExtraHTTPHeaders({
      'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${testInfo.workerIndex + 1}.9`,
    })
  })

  test('an admin adds a product with its options, and verifies a manufacturer', async ({
    request,
  }) => {
    const run = stamp()
    const adminToken = await tokenFor(request, ADMIN_EMAIL, ADMIN_PASSWORD)

    /* ── Half one · a product and its options, with no deployment (CAT-03) ── */

    const categories = data<{ categories: { id: string }[] }>(
      await call(request, 'get', '/api/v1/admin/catalog/categories?includeInactive=true', {
        token: adminToken,
      }),
      'list categories',
    )
    // The seed catalogue is already there; the gate adds to it, because an admin adding the
    // eighth product is the situation that actually happens.
    expect(categories.categories.length).toBeGreaterThanOrEqual(3)
    const categoryId = categories.categories[0]?.id ?? ''

    const product = data<{ productId: string; slugs: { tr: string; en: string } }>(
      await call(request, 'post', '/api/v1/admin/catalog/products/create', {
        token: adminToken,
        body: {
          categoryId,
          basisType: 'AREA_M2',
          translations: {
            tr: { name: `Gölgelik Ürünü ${run}` },
            en: { name: `Shading Product ${run}` },
          },
        },
      }),
      'create product',
    )

    // Per-locale slugs, Turkish folded (`ADR-017`).
    expect(product.slugs.tr).toMatch(/^golgelik-urunu-/)
    expect(product.slugs.en).toMatch(/^shading-product-/)

    const attribute = data<{ attributeId: string; impact: string }>(
      await call(request, 'post', '/api/v1/admin/catalog/attributes/create', {
        token: adminToken,
        body: {
          productId: product.productId,
          key: 'gate_renk',
          inputType: 'SELECT',
          isRequired: true,
          affectsPrice: true,
          sortOrder: 10,
          translations: { tr: { label: 'Renk' }, en: { label: 'Colour' } },
        },
      }),
      'create attribute',
    )

    // `10` §Admin authoring: a required attribute applies to new projects only, and the
    // admin is told rather than stopped.
    expect(attribute.impact).toBe('new-projects-only')

    const option = data<{ optionId: string }>(
      await call(request, 'post', '/api/v1/admin/catalog/options/create', {
        token: adminToken,
        body: {
          attributeId: attribute.attributeId,
          value: 'antrasit',
          sortOrder: 10,
          translations: { tr: { label: 'Antrasit' }, en: { label: 'Anthracite' } },
        },
      }),
      'create option',
    )

    // They are in the database, readable through the same catalogue the Phase 4 wizard loads.
    const products = data<{ products: { id: string; attributeCount: number }[] }>(
      await call(request, 'get', '/api/v1/admin/catalog/products?includeInactive=true', {
        token: adminToken,
      }),
      'list products',
    )
    expect(products.products.find((row) => row.id === product.productId)?.attributeCount).toBe(1)

    // Nothing references this option yet, so deleting it is allowed — which is what makes
    // the refusal in the integration suite a rule rather than a blanket ban.
    expect(
      'data' in
        (await call(request, 'post', '/api/v1/admin/catalog/options/delete', {
          token: adminToken,
          body: { optionId: option.optionId },
        })),
    ).toBe(true)

    /* ── A manufacturer walks in ─────────────────────────────────────────── */

    const founderEmail = `gate-founder-${run}@example.com`
    created.userEmails.push(founderEmail)
    const phone = `0555 ${run.slice(-3)} ${run.slice(-2)} 11`

    data<{ userId: string }>(
      await call(request, 'post', '/api/v1/auth/register', {
        body: {
          email: founderEmail,
          password: CUSTOMER_PASSWORD,
          fullName: 'Gate Kurucusu',
          locale: 'tr',
        },
      }),
      'register founder',
    )

    data<{ verified: true }>(
      await call(request, 'post', '/api/v1/auth/verify-email', {
        body: { token: await tokenFromMail(request, founderEmail) },
      }),
      'verify founder email',
    )

    const founderToken = await tokenFor(request, founderEmail, CUSTOMER_PASSWORD)

    data<{ sent: true }>(
      await call(request, 'post', '/api/v1/auth/phone/start', {
        token: founderToken,
        body: { phone },
      }),
      'start phone verification',
    )

    // The number is normalised by the shared schema before it is sent, so the outbox is
    // keyed on the E.164 form rather than what was typed.
    const normalised = `+90${phone.replace(/\D/g, '').replace(/^0/, '')}`

    data<{ verified: true }>(
      await call(request, 'post', '/api/v1/auth/phone/confirm', {
        token: founderToken,
        body: { code: await codeFromSms(request, normalised) },
      }),
      'confirm phone',
    )

    const company = data<{ companyId: string; status: string; role: string }>(
      await call(request, 'post', '/api/v1/companies', {
        token: founderToken,
        body: {
          legalName: `Gate Pergola Sanayi ve Ticaret A.Ş. ${run}`,
          displayName: `Gate Pergola ${run}`,
        },
      }),
      'create company',
    )
    created.companyIds.push(company.companyId)
    expect(company.status).toBe('PENDING')
    expect(company.role).toBe('OWNER')

    /* ── Half two · the admin verifies it ────────────────────────────────── */

    const queue = data<{ companies: { companyId: string; status: string }[] }>(
      await call(request, 'get', '/api/v1/admin/verification', { token: adminToken }),
      'verification queue',
    )
    expect(queue.companies.map((entry) => entry.companyId)).toContain(company.companyId)

    const detail = data<{ company: { documents: { id: string }[]; status: string } }>(
      await call(request, 'get', `/api/v1/admin/verification/${company.companyId}`, {
        token: adminToken,
      }),
      'company detail',
    )
    expect(detail.company.status).toBe('PENDING')

    for (const document of detail.company.documents) {
      expect(
        'data' in
          (await call(request, 'post', '/api/v1/admin/verification/documents/review', {
            token: adminToken,
            body: { documentId: document.id, status: 'APPROVED', note: 'Okunaklı ve güncel.' },
          })),
      ).toBe(true)
    }

    // A rejection with no reason is refused — the property the queue is built around.
    expect(
      'error' in
        (await call(request, 'post', '/api/v1/admin/verification/reject', {
          token: adminToken,
          body: { companyId: company.companyId },
        })),
    ).toBe(true)

    const decision = data<{ status: string; notified: boolean }>(
      await call(request, 'post', '/api/v1/admin/verification/verify', {
        token: adminToken,
        body: { companyId: company.companyId },
      }),
      'verify company',
    )
    expect(decision.status).toBe('VERIFIED')
    expect(decision.notified).toBe(true)

    /* ── The company reached that state, and both halves are in the trail ── */

    const after = data<{ company: { status: string; verifiedAt: string | null } }>(
      await call(request, 'get', `/api/v1/admin/verification/${company.companyId}`, {
        token: adminToken,
      }),
      'company after',
    )
    expect(after.company.status).toBe('VERIFIED')
    expect(after.company.verifiedAt).not.toBeNull()

    const companyTrail = data<{ entries: { action: string }[] }>(
      await call(
        request,
        'get',
        `/api/v1/admin/audit?entityType=Company&entityId=${company.companyId}`,
        { token: adminToken },
      ),
      'company audit trail',
    )
    expect(companyTrail.entries.map((entry) => entry.action)).toContain('company_verified')

    // Task 2.5's viewer reads what 2.2's writer produced, with no second table between them.
    const catalogueTrail = data<{ entries: { action: string }[] }>(
      await call(
        request,
        'get',
        `/api/v1/admin/audit?entityType=Product&entityId=${product.productId}`,
        { token: adminToken },
      ),
      'catalogue audit trail',
    )
    expect(catalogueTrail.entries.map((entry) => entry.action)).toContain('catalog_created')
  })

  test('the same endpoints refuse a caller who is not an admin', async ({ request }) => {
    // The gate is "an *admin* can". Without this, half of it would pass for anybody with a
    // browser.
    const anonymous = await call<never>(request, 'post', '/api/v1/admin/catalog/products/create', {
      body: {
        categoryId: 'whatever',
        basisType: 'UNIT',
        translations: { tr: { name: 'Olmaz' }, en: { name: 'Nope' } },
      },
    })

    expect('error' in anonymous).toBe(true)
    if (!('error' in anonymous)) return
    expect(anonymous.error.code).toBe('FORBIDDEN')

    const queue = await call<never>(request, 'get', '/api/v1/admin/verification', {})
    expect('error' in queue).toBe(true)
  })

  test('the dev mailbox and outbox exist only because there is no provider', async ({
    request,
  }) => {
    /*
     * Both are development surfaces guarded twice: `APP_ENV` and the provider. The second
     * gate is the one that matters — the env schema refuses `MAIL_PROVIDER=log` and
     * `SMS_PROVIDER=log` in production, so in a real deployment there is no buffer to read
     * even if the first were bypassed. Asserted here so the guard is watched rather than
     * assumed.
     */
    for (const path of ['/api/dev/mailbox', '/api/dev/outbox']) {
      const response = await request.get(path)
      expect(response.ok(), path).toBe(true)

      const body = (await response.json()) as { meta: { provider: string } }
      expect(body.meta.provider, path).toBe('log')
    }
  })
})
