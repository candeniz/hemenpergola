import { beforeAll, describe, expect, it } from 'vitest'

import {
  confirmAccountErasure,
  requestAccountErasure,
  downloadDataExport,
  requestDataExport,
} from '@/modules/privacy/application/privacy-service'
import { runRetentionSweep } from '@/modules/privacy/infrastructure/retention-sweep-job'
import { setMailer, type Email } from '@/modules/notification/infrastructure/mailer'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'
import { setStorage, type StorageProvider } from '@/shared/storage'

import { getPrisma } from './setup'

/**
 * KVKK rights and the retention sweeper against a real database — task 9.1.
 *
 * The headline assertions:
 *   - the sweeper's REAL pass deletes what its DRY-RUN counted, and legal-hold rows
 *     survive it bit-for-bit;
 *   - erasure is anonymisation: personal fields go, commercial ids stay;
 *   - the export carries the subject's data and nobody else's — no offer line items
 *     (ADR-006), no messages the subject did not write.
 */

const objects = new Map<string, Uint8Array>()
const fakeStorage: StorageProvider = {
  name: 'fake',
  async presignUpload({ key }) {
    return { uploadUrl: `https://example.invalid/${key}`, key, expiresIn: 300 }
  },
  async readUrl(key) {
    return `https://cdn.example.invalid/${key}`
  },
  async getObject(key) {
    const object = objects.get(key)
    if (object === undefined) throw new Error(`no object at ${key}`)
    return object
  },
  async putObject({ key, body }) {
    objects.set(key, body)
  },
  async deleteObject(key) {
    objects.delete(key)
  },
}

const sentMail: Email[] = []

let customerId = ''
let companyId = ''

const customerActor = (): ActorContext =>
  anonymousActor({ userId: customerId, globalRole: 'CUSTOMER', ip: '203.0.113.70' })

beforeAll(async () => {
  setStorage(fakeStorage)
  setMailer({
    name: 'recording',
    async send(email) {
      sentMail.push(email)
    },
  })

  const prisma = getPrisma()
  const customer = await prisma.user.create({
    data: {
      email: 'privacy-customer@example.com',
      fullName: 'Gizlilik Müşterisi',
      phone: '+905551110077',
    },
  })
  customerId = customer.id

  const company = await prisma.company.create({
    data: {
      slug: 'privacy-co',
      legalName: 'Privacy Co A.Ş.',
      displayName: 'Privacy Co',
      status: 'VERIFIED',
      verifiedAt: new Date(),
    },
  })
  companyId = company.id
}, 120_000)

async function engagementWithEvidence(): Promise<{
  offerRequestId: string
  consentId: string
  disclosureId: string
  offerId: string
}> {
  const prisma = getPrisma()
  const category = await prisma.category.create({ data: { sortOrder: 91 } })
  const product = await prisma.product.create({
    data: { categoryId: category.id, basisType: 'AREA_M2' },
  })
  const project = await prisma.project.create({
    data: {
      customerId,
      productId: product.id,
      status: 'SUBMITTED',
      quantity: 1,
      areaM2: 20,
      note: 'Bahçe kapısı koddan açılıyor: 4712',
    },
  })
  const consent = await prisma.consent.create({
    data: {
      userId: customerId,
      type: 'CONTACT_SHARING',
      textVersion: 'test.v1',
      ip: '203.0.113.70',
      userAgent: 'vitest',
    },
  })
  const request = await prisma.offerRequest.create({
    data: {
      projectId: project.id,
      customerId,
      companyId,
      status: 'WON',
      slaExpiresAt: new Date(),
      respondedAt: new Date(),
      contactDisclosedAt: new Date(),
      consentId: consent.id,
    },
  })
  const disclosure = await prisma.contactDisclosure.create({
    data: {
      offerRequestId: request.id,
      companyId,
      consentId: consent.id,
      disclosedFields: ['fullName', 'email', 'phone'],
    },
  })
  const offer = await prisma.offer.create({
    data: {
      offerRequestId: request.id,
      number: `PRV-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      status: 'ACCEPTED',
      netKurus: 10000000,
      taxKurus: 2000000,
      grossKurus: 12000000,
      taxRate: 20,
      validUntil: new Date(Date.now() + 14 * 24 * 3_600_000),
      lines: {
        create: [
          {
            description: 'Gizli kalem',
            quantity: 1,
            unit: 'adet',
            unitPriceKurus: 10000000,
            lineNetKurus: 10000000,
          },
        ],
      },
    },
  })
  return {
    offerRequestId: request.id,
    consentId: consent.id,
    disclosureId: disclosure.id,
    offerId: offer.id,
  }
}

describe('9.1 · the retention sweeper', () => {
  it('dry-runs first, applies what it counted, and legal-hold rows survive untouched', async () => {
    const prisma = getPrisma()
    const evidence = await engagementWithEvidence()

    // Sweepable matter: an expired anonymous draft, an old dispatched notification, an
    // old closed request with free text, an ancient rate-limit window.
    const category = await prisma.category.create({ data: { sortOrder: 90 } })
    const product = await prisma.product.create({
      data: { categoryId: category.id, basisType: 'AREA_M2' },
    })
    const oldDate = new Date(Date.now() - 40 * 24 * 3_600_000)
    const draft = await prisma.project.create({
      data: { anonymousKey: 'sweep-me', productId: product.id, status: 'DRAFT', quantity: 1 },
    })
    await prisma.$executeRaw`UPDATE "Project" SET "updatedAt" = ${oldDate} WHERE "id" = ${draft.id}`

    const staleNotification = await prisma.notification.create({
      data: {
        userId: customerId,
        type: 'offer_received',
        payload: {},
        dispatchedAt: new Date(Date.now() - 120 * 24 * 3_600_000),
      },
    })
    await prisma.$executeRaw`
      UPDATE "Notification" SET "createdAt" = ${new Date(Date.now() - 120 * 24 * 3_600_000)}
      WHERE "id" = ${staleNotification.id}
    `

    const consent2 = await prisma.consent.create({
      data: {
        userId: customerId,
        type: 'CONTACT_SHARING',
        textVersion: 'test.v1',
        ip: '203.0.113.70',
        userAgent: 'vitest',
      },
    })
    const oldProject = await prisma.project.create({
      data: { customerId, productId: product.id, status: 'SUBMITTED', quantity: 1 },
    })
    const oldRequest = await prisma.offerRequest.create({
      data: {
        projectId: oldProject.id,
        customerId,
        companyId,
        status: 'DECLINED',
        declineReason: 'Müşteri 0555 111 22 33 numarayı bıraktı',
        slaExpiresAt: new Date(),
        respondedAt: new Date(),
        consentId: consent2.id,
      },
    })
    await prisma.$executeRaw`
      UPDATE "OfferRequest" SET "updatedAt" = ${new Date(Date.now() - 4 * 365 * 24 * 3_600_000)}
      WHERE "id" = ${oldRequest.id}
    `

    await prisma.rateLimitHit.create({
      data: {
        bucket: 'auth:ip:198.51.100.1',
        windowStart: new Date(Date.now() - 400 * 24 * 3_600_000),
        count: 3,
      },
    })

    // ── dry-run: counts, writes nothing ──────────────────────────────────────
    const dry = await runRetentionSweep({ dryRun: true })
    expect(dry.dryRun).toBe(true)
    const dryByTable = Object.fromEntries(dry.lines.map((line) => [line.table, line.affected]))
    expect(dryByTable.Project).toBeGreaterThanOrEqual(1)
    expect(dryByTable.Notification).toBeGreaterThanOrEqual(1)
    expect(dryByTable.OfferRequest).toBeGreaterThanOrEqual(1)
    expect(dryByTable.RateLimitHit).toBeGreaterThanOrEqual(1)

    expect(await prisma.project.findUnique({ where: { id: draft.id } })).not.toBeNull()

    // ── the real pass ────────────────────────────────────────────────────────
    const applied = await runRetentionSweep({ dryRun: false })
    expect(applied.dryRun).toBe(false)
    for (const line of applied.lines) {
      expect(line.affected, line.rule).toBe(dryByTable[line.table])
    }

    expect(await prisma.project.findUnique({ where: { id: draft.id } })).toBeNull()
    expect(await prisma.notification.findUnique({ where: { id: staleNotification.id } })).toBeNull()

    // Anonymised, NOT deleted: the row stands, the free text is gone.
    const anonymised = await prisma.offerRequest.findUniqueOrThrow({
      where: { id: oldRequest.id },
    })
    expect(anonymised.status).toBe('DECLINED')
    expect(anonymised.declineReason).toBeNull()

    // ── legal hold: bit-for-bit survival ─────────────────────────────────────
    expect(await prisma.consent.findUnique({ where: { id: evidence.consentId } })).not.toBeNull()
    const disclosure = await prisma.contactDisclosure.findUniqueOrThrow({
      where: { id: evidence.disclosureId },
    })
    expect(disclosure.disclosedFields).toEqual(['fullName', 'email', 'phone'])
    expect(await prisma.offer.findUnique({ where: { id: evidence.offerId } })).not.toBeNull()

    // Idempotent: the replay finds nothing.
    const replay = await runRetentionSweep({ dryRun: false })
    for (const line of replay.lines) {
      if (line.table === 'RateLimitHit') continue // this suite itself makes fresh hits
      expect(line.affected, `${line.rule} on replay`).toBe(0)
    }
  }, 120_000)
})

describe('9.1 · export and erasure', () => {
  it('exports the subject’s data and nobody else’s — no line items, no received messages', async () => {
    const before = sentMail.length
    const receipt = await requestDataExport(customerActor(), {})
    expect(receipt.ok).toBe(true)

    // The signed link went by mail; pull the token out and download through the service.
    expect(sentMail.length).toBe(before + 1)
    const token = /token=([A-Za-z0-9_-]+)/.exec(sentMail.at(-1)?.text ?? '')?.[1]
    expect(token).toBeDefined()

    const download = await downloadDataExport(anonymousActor(), { token: token! })
    expect(download.ok).toBe(true)
    if (!download.ok) return

    const pkg = JSON.parse(new TextDecoder().decode(download.value.body)) as {
      profile: { email: string }
      offerRequests: { offers: Record<string, unknown>[] }[]
    }
    expect(pkg.profile.email).toBe('privacy-customer@example.com')

    const raw = JSON.stringify(pkg)
    // ADR-006 at export: totals yes, line items never.
    expect(raw).not.toContain('Gizli kalem')
    expect(raw).not.toContain('lines')
    // Nobody else's words: no received messages, and no other user's identity.
    expect(raw).not.toContain('anonymised.local')
  }, 60_000)

  it('carries the notification surface — Q33, task 14.5', async () => {
    const prisma = getPrisma()

    /*
     * All three are personal data by this codebase's own reckoning: `performAnonymisation`
     * deletes every one of them. Data the erasure right reaches is data the access right
     * reaches, and until 14.5 the export answered a narrower question than the one asked.
     */
    await prisma.notificationPreference.create({
      data: { userId: customerId, channel: 'email', type: 'offer_received', enabled: false },
    })
    await prisma.notification.create({
      data: { userId: customerId, type: 'offer_received', payload: { companyName: 'Ege Pergola' } },
    })
    await prisma.pushToken.create({
      data: {
        userId: customerId,
        token: 'ExponentPushToken[export-secret-address]',
        platform: 'android',
      },
    })

    const receipt = await requestDataExport(customerActor(), {})
    expect(receipt.ok).toBe(true)
    const token = /token=([A-Za-z0-9_-]+)/.exec(sentMail.at(-1)?.text ?? '')?.[1]
    const download = await downloadDataExport(anonymousActor(), { token: token! })
    expect(download.ok).toBe(true)
    if (!download.ok) return

    const pkg = JSON.parse(new TextDecoder().decode(download.value.body)) as {
      notificationPreferences: { channel: string; type: string; enabled: boolean }[]
      notifications: { type: string; title: string | null; body: string | null }[]
      devices: { platform: string; lastSeenAt: string }[]
    }

    expect(pkg.notificationPreferences).toContainEqual({
      channel: 'email',
      type: 'offer_received',
      enabled: false,
    })
    /*
     * **Rendered, in the subject's own language** — task 14.6. An access request asks for an
     * intelligible copy; `{"companyName":"Ege Pergola"}` is the template's input, not the
     * message the person received.
     */
    const received = pkg.notifications.find((row) => row.type === 'offer_received')
    expect(received).toBeDefined()
    expect(received?.title, 'a rendered Turkish title, not a payload').toBe('Yeni teklif geldi')
    expect(received?.body).toContain('Ege Pergola')

    // And the raw payload is gone, not demoted to a second field: the identifiers that mean
    // anything are already in this package's `offerRequests` section.
    expect(JSON.stringify(pkg.notifications)).not.toContain('payload')
    expect(JSON.stringify(pkg.notifications)).not.toContain('companyName')
    expect(pkg.devices.map((row) => row.platform)).toContain('android')

    /*
     * And the redaction, which is the half a reviewer would not think to check: the device
     * is disclosed, its ADDRESS is not. A push token is a live capability — whoever holds it
     * can push to that handset — and this file leaves our custody behind a signed link.
     */
    const raw = JSON.stringify(pkg)
    expect(raw, 'the raw push token must never leave in an export').not.toContain(
      'export-secret-address',
    )
    expect(raw).not.toContain('ExponentPushToken')
  }, 60_000)

  it('erasure anonymises: personal fields go, commercial ids stay, sessions die', async () => {
    const prisma = getPrisma()

    // 12.3: a device address is personal data — plant one and watch erasure take it.
    await prisma.pushToken.create({
      data: { userId: customerId, token: 'ExponentPushToken[erasure-test]', platform: 'android' },
    })

    const wrongEmail = await requestAccountErasure(customerActor(), {
      confirmEmail: 'baskasi@example.com',
    })
    expect(wrongEmail.ok).toBe(false)

    /*
     * Q30: request → verification → anonymisation. The request only sends the email; the
     * token in it is what anonymises — captured from the captured mail, exactly the way a
     * person would use it.
     */
    const before = sentMail.length
    const requested = await requestAccountErasure(customerActor(), {
      confirmEmail: 'privacy-customer@example.com',
    })
    expect(requested.ok).toBe(true)
    expect(sentMail.length).toBe(before + 1)

    // Nothing has happened yet — the request is not the erasure.
    const untouched = await prisma.user.findUniqueOrThrow({ where: { id: customerId } })
    expect(untouched.status).not.toBe('DELETED')

    const token = /token=([A-Za-z0-9_-]+)/.exec(sentMail.at(-1)?.text ?? '')?.[1]
    expect(token).toBeDefined()

    const result = await confirmAccountErasure(anonymousActor(), { token: token! })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.anonymisedEmail).toMatch(/^deleted-[0-9a-f]{16}@anonymised\.local$/)

    const user = await prisma.user.findUniqueOrThrow({ where: { id: customerId } })
    expect(user.email).toBe(result.value.anonymisedEmail)
    expect(user.fullName).toBeNull()
    expect(user.phone).toBeNull()
    expect(user.status).toBe('DELETED')
    expect(await prisma.pushToken.count({ where: { userId: customerId } })).toBe(0)

    // Commercial records keep their ids; the disclosure evidence keeps its content.
    expect(await prisma.offerRequest.count({ where: { customerId } })).toBeGreaterThan(0)
    expect(await prisma.consent.count({ where: { userId: customerId } })).toBeGreaterThan(0)

    // The projects' free text is gone (ADR-026's channel, closed at erasure too).
    const notes = await prisma.project.findMany({
      where: { customerId },
      select: { note: true },
    })
    expect(notes.every((project) => project.note === null)).toBe(true)

    // The token is single-use: a replayed link is refused, not replayed.
    const replayed = await confirmAccountErasure(anonymousActor(), { token: token! })
    expect(replayed.ok).toBe(false)

    // And a fresh request against the anonymised account is refused too.
    const again = await requestAccountErasure(customerActor(), {
      confirmEmail: result.value.anonymisedEmail,
    })
    expect(again.ok).toBe(false)
  }, 60_000)
})

describe('9.1 · the export PDF renders Turkish', () => {
  it('produces a real PDF whose embedded font carries the Turkish repertoire', async () => {
    const { renderExportPdf } = await import('@/modules/privacy/infrastructure/export-pdf')

    // The names that break a WinAnsi font: dotted/dotless i, ş, ğ — plus the lira sign.
    const bytes = await renderExportPdf({
      exportedAt: '2026-08-25T09:00:00.000Z',
      profile: { fullName: 'Işıl Şahingöz', email: 'isil@example.com' },
      projects: [
        {
          product: 'Bioklimatik Pergola',
          city: 'İstanbul',
          status: 'SUBMITTED',
          note: 'Ağustos’ta montaj',
        },
      ],
      offerRequests: [
        {
          company: 'Ege Pergola',
          status: 'WON',
          createdAt: '2026-08-01',
          offers: [{ number: 'EGE-2026-0002', grossKurus: 12000000 }],
        },
      ],
      consents: [],
      reviews: [],
      messagesSent: [],
      // 14.5's three sections, with the glyphs that break a WinAnsi font in their headings
      // and their values — "Bildirim tercihleriniz", "Kayıtlı cihazlarınız", "okunmadı".
      notificationPreferences: [{ type: 'offer_received', channel: 'email', enabled: false }],
      notifications: [{ createdAt: '2026-08-02', type: 'contact_disclosed', readAt: null }],
      devices: [{ platform: 'android', createdAt: '2026-08-01', lastSeenAt: '2026-08-20' }],
    })

    // A real PDF, not a stub.
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(2000)

    const raw = Buffer.from(bytes).toString('latin1')
    // The font is EMBEDDED (a FontFile2 stream) — without it the Turkish glyphs would be
    // missing whatever the text layer says.
    expect(raw).toContain('FontFile2')
    expect(raw).toMatch(/NotoSans/)

    // And the glyphs actually resolved: pdfkit refuses to encode a character the
    // embedded subset lacks, so reaching here with these strings is the assertion. A
    // narrowed subset fails HERE rather than in a customer's download.
    const narrowed = await renderExportPdf({
      profile: { fullName: 'ĞÜŞİÖÇ ğüşiöç ₺' },
      consents: [],
      projects: [],
      offerRequests: [],
      reviews: [],
      messagesSent: [],
    })
    expect(narrowed.length).toBeGreaterThan(2000)
  }, 60_000)
})
