import { beforeAll, describe, expect, it } from 'vitest'

import { listCalendar } from '@/modules/offer/application/appointment-service'
import { createOfferRequests } from '@/modules/offer/application/offer-request-service'
import { zonedInstant } from '@/modules/offer/domain/calendar'
import { CONTACT_SHARING_TEXT_VERSION } from '@/shared/legal/consent-version'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'

import { getPrisma } from './setup'

/**
 * `listCalendar` against a real database — task 14.1.
 *
 * The domain's arithmetic is proven without a database in `calendar.test.ts`. What only a
 * database can prove is here:
 *
 *   - **company scoping**, which lives in the `where` clause and nowhere else
 *     (`CLAUDE.md` §3). A calendar that leaks another company's surveys is a disclosure bug
 *     wearing a grid.
 *   - **all three kinds come back from three different tables** in one call, which is the
 *     part a fake would let pass by returning whatever the test asked for.
 *   - **the window is the six-week grid, not the month** — an appointment in a borrowed
 *     leading cell has to appear, and that is a range decision made across the seam.
 *   - **no contact data**, the `ADR-026` trap: the customer's email, phone and free-text
 *     note must not reach a surface that is not the disclosure.
 */

const NOTE_TRAP = 'ZİLİ ÇALIŞMIYOR beni 0532 555 0000 numaradan arayın'
const CUSTOMER_EMAIL = 'calendar-customer@example.com'
const CUSTOMER_PHONE = '+905551119988'

/** July 2026: the grid runs Mon 29 June → Sun 9 August. */
const YEAR = 2026
const MONTH = 7

let customerId = ''
let companyA = ''
let companyB = ''
let ownerA = ''
let ownerB = ''
let requestA = ''
let requestB = ''

const customerActor = (): ActorContext =>
  anonymousActor({ userId: customerId, globalRole: 'CUSTOMER', ip: '203.0.113.40' })

const manufacturerActor = (companyId: string, userId: string): ActorContext =>
  anonymousActor({
    userId,
    globalRole: 'CUSTOMER',
    companyId,
    companyRole: 'OWNER',
    companyStatus: 'VERIFIED',
    ip: '203.0.113.41',
  })

async function verifiedCompany(label: string): Promise<{ companyId: string; ownerId: string }> {
  const prisma = getPrisma()
  const company = await prisma.company.create({
    data: {
      slug: `calendar-${label}`,
      legalName: `Calendar ${label} A.Ş.`,
      displayName: `Calendar ${label}`,
      status: 'VERIFIED',
      verifiedAt: new Date(),
    },
  })
  const owner = await prisma.user.create({
    data: { email: `calendar-owner-${label}@example.com`, fullName: `Owner ${label}` },
  })
  await prisma.companyMembership.create({
    data: { userId: owner.id, companyId: company.id, role: 'OWNER', acceptedAt: new Date() },
  })
  return { companyId: company.id, ownerId: owner.id }
}

beforeAll(async () => {
  const prisma = getPrisma()

  const city = await prisma.city.create({ data: { name: 'CalendarCity', plateCode: 911 } })
  const category = await prisma.category.create({ data: { sortOrder: 96 } })
  const product = await prisma.product.create({
    data: { categoryId: category.id, basisType: 'AREA_M2' },
  })

  const customer = await prisma.user.create({
    data: { email: CUSTOMER_EMAIL, fullName: 'Takvim Müşteri', phone: CUSTOMER_PHONE },
  })
  customerId = customer.id

  const a = await verifiedCompany('a')
  const b = await verifiedCompany('b')
  companyA = a.companyId
  ownerA = a.ownerId
  companyB = b.companyId
  ownerB = b.ownerId

  const project = await prisma.project.create({
    data: {
      customerId,
      productId: product.id,
      status: 'READY',
      widthMm: 5000,
      depthMm: 4000,
      heightMm: 2800,
      areaM2: 20,
      quantity: 1,
      cityId: city.id,
      title: 'Takvim projesi',
      note: NOTE_TRAP,
    },
  })

  // Through the service, so the consent row the FK requires exists (`19` §Consent).
  const created = await createOfferRequests(customerActor(), {
    projectId: project.id,
    companyIds: [companyA, companyB],
    consent: { accepted: true, textVersion: CONTACT_SHARING_TEXT_VERSION },
  })
  if (!created.ok) throw new Error('fixture: could not create the offer requests')

  const requests = await prisma.offerRequest.findMany({
    where: { projectId: project.id },
    select: { id: true, companyId: true },
  })
  requestA = requests.find((row) => row.companyId === companyA)?.id ?? ''
  requestB = requests.find((row) => row.companyId === companyB)?.id ?? ''

  /*
   * Company A gets one of each kind, plus a survey in the grid's LEADING cell (29 June —
   * rendered by a July grid, outside the July month).
   */
  await prisma.offerRequest.update({
    where: { id: requestA },
    data: { status: 'PENDING', slaExpiresAt: zonedInstant(YEAR, MONTH, 20, 17, 0) },
  })
  await prisma.appointment.createMany({
    data: [
      {
        offerRequestId: requestA,
        // 21:30 UTC on the 14th is 00:30 on the 15th in Istanbul.
        scheduledAt: new Date('2026-07-14T21:30:00.000Z'),
        status: 'SCHEDULED',
      },
      {
        offerRequestId: requestA,
        scheduledAt: zonedInstant(YEAR, 6, 29, 10, 0),
        status: 'SCHEDULED',
      },
      {
        offerRequestId: requestA,
        scheduledAt: zonedInstant(YEAR, MONTH, 22, 10, 0),
        status: 'CANCELLED',
      },
    ],
  })
  await prisma.offer.create({
    data: {
      offerRequestId: requestA,
      number: 'CAL-2026-0001',
      status: 'SENT',
      validUntil: zonedInstant(YEAR, MONTH, 25, 12, 0),
      netKurus: 100_000_00,
      taxKurus: 20_000_00,
      grossKurus: 120_000_00,
      taxRate: 20,
      sentAt: new Date(),
    },
  })

  // Company B gets a survey in the same month, which A must never see.
  await prisma.appointment.create({
    data: {
      offerRequestId: requestB,
      scheduledAt: zonedInstant(YEAR, MONTH, 16, 9, 0),
      status: 'SCHEDULED',
    },
  })
}, 120_000)

describe('14.1 · listCalendar', () => {
  it('returns all three kinds, from three tables, in one call', async () => {
    const result = await listCalendar(manufacturerActor(companyA, ownerA), {
      year: YEAR,
      month: MONTH,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const kinds = new Set(result.value.events.map((event) => event.kind))
    expect([...kinds].sort()).toEqual(['offer_expiry', 'request_deadline', 'survey'])
    expect(result.value.year).toBe(YEAR)
    expect(result.value.month).toBe(MONTH)
  })

  it('scopes to the caller company — B’s survey is invisible to A', async () => {
    const forA = await listCalendar(manufacturerActor(companyA, ownerA), {
      year: YEAR,
      month: MONTH,
    })
    const forB = await listCalendar(manufacturerActor(companyB, ownerB), {
      year: YEAR,
      month: MONTH,
    })

    expect(forA.ok && forB.ok).toBe(true)
    if (!forA.ok || !forB.ok) return

    expect(forA.value.events.every((event) => event.offerRequestId !== requestB)).toBe(true)
    expect(forB.value.events.every((event) => event.offerRequestId !== requestA)).toBe(true)
    expect(forB.value.events).toHaveLength(1)
  })

  it('covers the whole grid, so a survey in a borrowed leading cell appears', async () => {
    const result = await listCalendar(manufacturerActor(companyA, ownerA), {
      year: YEAR,
      month: MONTH,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // 29 June is outside July and inside July's grid.
    const june = result.value.events.filter((event) => event.at < '2026-07-01')
    expect(june, 'the leading cell is rendered, so its events must be fetched').toHaveLength(1)
  })

  it('leaves cancelled appointments out', async () => {
    const result = await listCalendar(manufacturerActor(companyA, ownerA), {
      year: YEAR,
      month: MONTH,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const surveys = result.value.events.filter((event) => event.kind === 'survey')
    // Three appointments were planted for A; one is CANCELLED.
    expect(surveys).toHaveLength(2)
  })

  it('carries no contact data — ADR-026, the note trap included', async () => {
    const result = await listCalendar(manufacturerActor(companyA, ownerA), {
      year: YEAR,
      month: MONTH,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const serialised = JSON.stringify(result.value)
    expect(serialised).not.toContain(CUSTOMER_EMAIL)
    expect(serialised).not.toContain(CUSTOMER_PHONE)
    expect(serialised).not.toContain('0532 555 0000')
    expect(serialised).not.toContain('Takvim Müşteri')
  })

  it('refuses a caller with no membership', async () => {
    const result = await listCalendar(
      anonymousActor({ userId: ownerA, globalRole: 'CUSTOMER', ip: '203.0.113.42' }),
      { year: YEAR, month: MONTH },
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('FORBIDDEN')
  })

  it('answers a global admin with an empty calendar rather than crashing', async () => {
    /*
     * `authorize` lets `globalRole: 'ADMIN'` past every company permission, so an admin
     * reaches the body with no `companyId`. That is the one live caller of the null branch,
     * and what it must do is return nothing — not throw, and emphatically not fall back to
     * some other company's calendar.
     */
    const result = await listCalendar(
      anonymousActor({ userId: ownerA, globalRole: 'ADMIN', ip: '203.0.113.43' }),
      { year: YEAR, month: MONTH },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.events).toEqual([])
    expect(result.value.year).toBe(YEAR)
  })
})
