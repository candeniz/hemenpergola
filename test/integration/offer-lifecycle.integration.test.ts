import { beforeAll, describe, expect, it } from 'vitest'

import {
  acceptOfferRequest,
  createOfferRequests,
  declineOfferRequest,
  getLeadForCompany,
} from '@/modules/offer/application/offer-request-service'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'
import { CONTACT_SHARING_TEXT_VERSION } from '@/shared/legal/consent-version'

import { getPrisma } from './setup'

/**
 * The offer-request lifecycle against a real database — tasks 6.2, 6.4, 6.5, 6.10.
 *
 * What cannot be proven against a fake: the `FOR UPDATE` row lock (6.10's race), the
 * transaction boundary that keeps notifications out of rollbacks, and the
 * `ContactDisclosure` UNIQUE that makes exactly-once a property of the table.
 */

const CUSTOMER_EMAIL = 'offer-customer@example.com'
const CUSTOMER_PHONE = '+905551112233'

let customerId = ''
let projectId = ''
let companyA = ''
let companyB = ''
let companyC = ''
let ownerA = ''
let ownerB = ''
let productId = ''
let cityId = ''

const customerActor = (): ActorContext =>
  anonymousActor({ userId: customerId, globalRole: 'CUSTOMER', ip: '203.0.113.10' })

const manufacturerActor = (companyId: string, userId: string): ActorContext =>
  anonymousActor({
    userId,
    globalRole: 'CUSTOMER',
    companyId,
    companyRole: 'OWNER',
    companyStatus: 'VERIFIED',
    ip: '203.0.113.20',
  })

let sequence = 0
async function verifiedCompany(label: string): Promise<{ companyId: string; ownerId: string }> {
  sequence += 1
  const prisma = getPrisma()

  const company = await prisma.company.create({
    data: {
      slug: `offer-${label}-${sequence}`,
      legalName: `Offer ${label} A.Ş.`,
      displayName: `Offer ${label}`,
      status: 'VERIFIED',
      verifiedAt: new Date(),
    },
  })
  const owner = await prisma.user.create({
    data: { email: `offer-owner-${label}-${sequence}@example.com`, fullName: `Owner ${label}` },
  })
  await prisma.companyMembership.create({
    data: { userId: owner.id, companyId: company.id, role: 'OWNER', acceptedAt: new Date() },
  })

  return { companyId: company.id, ownerId: owner.id }
}

async function freshReadyProject(): Promise<string> {
  const project = await getPrisma().project.create({
    data: {
      customerId,
      productId,
      status: 'READY',
      widthMm: 5000,
      depthMm: 4000,
      heightMm: 2800,
      areaM2: 20,
      quantity: 1,
      cityId,
    },
  })
  return project.id
}

const CONSENT = { accepted: true as const, textVersion: CONTACT_SHARING_TEXT_VERSION }

beforeAll(async () => {
  const prisma = getPrisma()

  const city = await prisma.city.create({ data: { name: 'OfferCity', plateCode: 910 } })
  cityId = city.id
  const category = await prisma.category.create({ data: { sortOrder: 97 } })
  const product = await prisma.product.create({
    data: { categoryId: category.id, basisType: 'AREA_M2' },
  })
  productId = product.id

  const customer = await prisma.user.create({
    data: { email: CUSTOMER_EMAIL, fullName: 'Ayşe Talep', phone: CUSTOMER_PHONE },
  })
  customerId = customer.id

  const a = await verifiedCompany('a')
  const b = await verifiedCompany('b')
  const c = await verifiedCompany('c')
  companyA = a.companyId
  ownerA = a.ownerId
  companyB = b.companyId
  ownerB = b.ownerId
  companyC = c.companyId

  projectId = await freshReadyProject()
}, 120_000)

describe('6.3 · creation captures consent with its text version', () => {
  it('creates PENDING requests, one consent row, and notifies the owners after commit', async () => {
    const result = await createOfferRequests(customerActor(), {
      projectId,
      companyIds: [companyA, companyB],
      consent: CONSENT,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.created).toHaveLength(2)

    const consent = await getPrisma().consent.findFirst({
      where: { userId: customerId, type: 'CONTACT_SHARING' },
      orderBy: { grantedAt: 'desc' },
    })
    expect(consent?.textVersion).toBe(CONTACT_SHARING_TEXT_VERSION)

    const rows = await getPrisma().offerRequest.findMany({ where: { projectId } })
    expect(rows.map((row) => row.status)).toEqual(['PENDING', 'PENDING'])
    // Q7: 48 h by default. A generous window on the assertion, not on the SLA.
    const hours = (rows[0]!.slaExpiresAt.getTime() - Date.now()) / 3_600_000
    expect(hours).toBeGreaterThan(47)
    expect(hours).toBeLessThan(49)

    const ownerNotes = await getPrisma().notification.findMany({
      where: { type: 'offer_request_received', userId: { in: [ownerA, ownerB] } },
    })
    expect(ownerNotes).toHaveLength(2)
  })

  it('refuses a stale consent text version — evidence must match the words shown', async () => {
    const result = await createOfferRequests(customerActor(), {
      projectId: await freshReadyProject(),
      companyIds: [companyA],
      consent: { accepted: true, textVersion: 'v0-never-shipped' },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('PRECONDITION')
  })

  it('refuses re-sending to a company that already has this request', async () => {
    const result = await createOfferRequests(customerActor(), {
      projectId,
      companyIds: [companyA],
      consent: CONSENT,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('CONFLICT')
  })
})

describe('6.5 · one route, two DTOs — the boundary is the shape', () => {
  it('serves a PENDING lead whose JSON carries no contact data at all', async () => {
    const pending = await getPrisma().offerRequest.findFirstOrThrow({
      where: { projectId, companyId: companyA },
    })

    const view = await getLeadForCompany(manufacturerActor(companyA, ownerA), {
      offerRequestId: pending.id,
    })
    expect(view.ok).toBe(true)
    if (!view.ok) return

    expect(view.value.kind).toBe('pending')
    // The shape, not the page: the serialised DTO contains neither the contact keys nor the
    // contact values this suite planted.
    const serialised = JSON.stringify(view.value)
    expect(Object.keys(view.value)).not.toContain('contact')
    expect(serialised).not.toContain(CUSTOMER_EMAIL)
    expect(serialised).not.toContain(CUSTOMER_PHONE)
    expect(serialised).not.toContain('Ayşe')
  })
})

describe('6.4 · the disclosure — exactly once, idempotent under a double accept', () => {
  it('accept writes disclosure + audit in-tx, and the customer notification after commit', async () => {
    const pending = await getPrisma().offerRequest.findFirstOrThrow({
      where: { projectId, companyId: companyA },
    })

    const accepted = await acceptOfferRequest(manufacturerActor(companyA, ownerA), {
      offerRequestId: pending.id,
    })
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return

    // The accepted DTO is the other side of the boundary: contact present, exact fields.
    expect(accepted.value.kind).toBe('accepted')
    expect(accepted.value.contact.email).toBe(CUSTOMER_EMAIL)
    expect(accepted.value.contact.phone).toBe(CUSTOMER_PHONE)

    // Exactly one of each of the four things `CLAUDE.md` non-negotiable 8 names.
    const disclosures = await getPrisma().contactDisclosure.findMany({
      where: { offerRequestId: pending.id },
    })
    expect(disclosures).toHaveLength(1)
    expect(disclosures[0]?.disclosedFields.sort()).toEqual(['email', 'fullName', 'phone'])

    const audits = await getPrisma().auditLog.findMany({
      where: { entityType: 'OfferRequest', entityId: pending.id, action: 'contact_disclosed' },
    })
    expect(audits).toHaveLength(1)

    const notes = await getPrisma().notification.findMany({
      where: { userId: customerId, type: 'contact_disclosed' },
    })
    expect(notes).toHaveLength(1)

    const row = await getPrisma().offerRequest.findUniqueOrThrow({ where: { id: pending.id } })
    expect(row.status).toBe('ACCEPTED')
    expect(row.contactDisclosedAt).not.toBeNull()
  })

  it('a second accept is a 409 and writes NOTHING — no second row, audit, or notification', async () => {
    const accepted = await getPrisma().offerRequest.findFirstOrThrow({
      where: { projectId, companyId: companyA },
    })

    const again = await acceptOfferRequest(manufacturerActor(companyA, ownerA), {
      offerRequestId: accepted.id,
    })
    expect(again.ok).toBe(false)
    if (again.ok) return
    expect(again.error.kind).toBe('CONFLICT')

    expect(
      await getPrisma().contactDisclosure.count({ where: { offerRequestId: accepted.id } }),
    ).toBe(1)
    expect(
      await getPrisma().auditLog.count({
        where: { entityType: 'OfferRequest', entityId: accepted.id, action: 'contact_disclosed' },
      }),
    ).toBe(1)
    // The notification stayed at one: the losing path returned before the post-commit step,
    // which is the behavioural face of "notifications after commit, never inside".
    expect(
      await getPrisma().notification.count({
        where: { userId: customerId, type: 'contact_disclosed' },
      }),
    ).toBe(1)
  })

  it('serves the accepted DTO on the same route the pending one came from', async () => {
    const accepted = await getPrisma().offerRequest.findFirstOrThrow({
      where: { projectId, companyId: companyA },
    })

    const view = await getLeadForCompany(manufacturerActor(companyA, ownerA), {
      offerRequestId: accepted.id,
    })
    expect(view.ok && view.value.kind).toBe('accepted')
  })
})

describe('6.10 · concurrency: simultaneous accept and decline → exactly one 409', () => {
  it('lets one side win, gives the other a CONFLICT, and never corrupts the row', async () => {
    const requestRow = await getPrisma().offerRequest.findFirstOrThrow({
      where: { projectId, companyId: companyB },
    })

    const [acceptResult, declineResult] = await Promise.all([
      acceptOfferRequest(manufacturerActor(companyB, ownerB), {
        offerRequestId: requestRow.id,
      }),
      declineOfferRequest(manufacturerActor(companyB, ownerB), {
        offerRequestId: requestRow.id,
        reason: 'Kapasite dolu',
      }),
    ])

    const outcomes = [acceptResult.ok, declineResult.ok]
    expect(outcomes.filter(Boolean)).toHaveLength(1)

    const loser = acceptResult.ok ? declineResult : acceptResult
    expect(!loser.ok && loser.error.kind).toBe('CONFLICT')

    const row = await getPrisma().offerRequest.findUniqueOrThrow({ where: { id: requestRow.id } })
    if (acceptResult.ok) {
      expect(row.status).toBe('ACCEPTED')
      expect(
        await getPrisma().contactDisclosure.count({ where: { offerRequestId: requestRow.id } }),
      ).toBe(1)
    } else {
      expect(row.status).toBe('DECLINED')
      // The losing accept disclosed nothing and notified nobody — its transaction never
      // committed, so its post-commit notification never ran.
      expect(
        await getPrisma().contactDisclosure.count({ where: { offerRequestId: requestRow.id } }),
      ).toBe(0)
      expect(
        await getPrisma().notification.count({
          where: {
            userId: customerId,
            type: 'contact_disclosed',
            payload: { path: ['offerRequestId'], equals: requestRow.id },
          },
        }),
      ).toBe(0)
    }
  })
})

describe('guards from 11 the service owns', () => {
  it('answers NOT_FOUND for another company reaching for the lead', async () => {
    const foreign = await getPrisma().offerRequest.findFirstOrThrow({
      where: { projectId, companyId: companyA },
    })
    const otherOwner = await getPrisma().companyMembership.findFirstOrThrow({
      where: { companyId: companyC, role: 'OWNER' },
    })

    const view = await getLeadForCompany(manufacturerActor(companyC, otherOwner.userId), {
      offerRequestId: foreign.id,
    })
    expect(view.ok).toBe(false)
    if (view.ok) return
    expect(view.error.kind).toBe('NOT_FOUND')
  })

  it('refuses accept after the SLA window, as a CONFLICT from the machine', async () => {
    const late = await createOfferRequests(customerActor(), {
      projectId: await freshReadyProject(),
      companyIds: [companyC],
      consent: CONSENT,
    })
    expect(late.ok).toBe(true)
    if (!late.ok) return

    const id = late.value.created[0]!.offerRequestId
    await getPrisma().offerRequest.update({
      where: { id },
      data: { slaExpiresAt: new Date(Date.now() - 60_000) },
    })

    const otherOwner = await getPrisma().companyMembership.findFirstOrThrow({
      where: { companyId: companyC, role: 'OWNER' },
    })
    const result = await acceptOfferRequest(manufacturerActor(companyC, otherOwner.userId), {
      offerRequestId: id,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('CONFLICT')
    expect(await getPrisma().contactDisclosure.count({ where: { offerRequestId: id } })).toBe(0)
  })

  it('refuses creation against a project that is not READY', async () => {
    const draft = await getPrisma().project.create({
      data: { customerId, productId, status: 'DRAFT', cityId },
    })
    const result = await createOfferRequests(customerActor(), {
      projectId: draft.id,
      companyIds: [companyC],
      consent: CONSENT,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('PRECONDITION')
  })
})
