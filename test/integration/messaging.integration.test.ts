import { beforeAll, describe, expect, it } from 'vitest'

import {
  listThreadAsCompany,
  listThreadAsCustomer,
  sendMessageAsCompany,
  sendMessageAsCustomer,
} from '@/modules/messaging/application/message-service'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'

import { getPrisma } from './setup'

/**
 * Messaging against a real database — task 7.1 second half.
 *
 * **The test that locks `ADR-028`** lives here: sending into a `PENDING` request is a
 * `PRECONDITION` error, and the same call succeeds the moment the request is `ACCEPTED`.
 * That refusal is the whole point of the module — Phase 6's disclosure boundary would be
 * decorative with a pre-acceptance message box next to it.
 */

let customerId = ''
let companyId = ''
let ownerId = ''
let outsiderId = ''
let cityId = ''
let productId = ''

const customerActor = (): ActorContext =>
  anonymousActor({ userId: customerId, globalRole: 'CUSTOMER', ip: '203.0.113.30' })

const outsiderActor = (): ActorContext =>
  anonymousActor({ userId: outsiderId, globalRole: 'CUSTOMER', ip: '203.0.113.31' })

const companyActor = (): ActorContext =>
  anonymousActor({
    userId: ownerId,
    globalRole: 'CUSTOMER',
    companyId,
    companyRole: 'OWNER',
    companyStatus: 'VERIFIED',
    ip: '203.0.113.32',
  })

async function requestInStatus(status: string): Promise<string> {
  const prisma = getPrisma()

  const project = await prisma.project.create({
    data: {
      customerId,
      productId,
      status: 'SUBMITTED',
      areaM2: 20,
      quantity: 1,
      cityId,
    },
  })
  const consent = await prisma.consent.create({
    data: {
      userId: customerId,
      type: 'CONTACT_SHARING',
      textVersion: 'test.v1',
      ip: '203.0.113.30',
      userAgent: 'vitest',
    },
  })
  const request = await prisma.offerRequest.create({
    data: {
      projectId: project.id,
      customerId,
      companyId,
      status: status as never,
      slaExpiresAt: new Date(Date.now() + 48 * 3_600_000),
      consentId: consent.id,
      ...(status === 'PENDING' ? {} : { respondedAt: new Date() }),
    },
  })
  return request.id
}

beforeAll(async () => {
  const prisma = getPrisma()

  const city = await prisma.city.create({ data: { name: 'MessagingCity', plateCode: 915 } })
  cityId = city.id
  const category = await prisma.category.create({ data: { sortOrder: 95 } })
  const product = await prisma.product.create({
    data: { categoryId: category.id, basisType: 'AREA_M2' },
  })
  productId = product.id

  const customer = await prisma.user.create({
    data: { email: 'messaging-customer@example.com', fullName: 'Mesaj Müşterisi' },
  })
  customerId = customer.id

  const outsider = await prisma.user.create({
    data: { email: 'messaging-outsider@example.com', fullName: 'Başka Müşteri' },
  })
  outsiderId = outsider.id

  const company = await prisma.company.create({
    data: {
      slug: 'messaging-co',
      legalName: 'Messaging Co A.Ş.',
      displayName: 'Messaging Co',
      status: 'VERIFIED',
      verifiedAt: new Date(),
    },
  })
  companyId = company.id

  const owner = await prisma.user.create({
    data: { email: 'messaging-owner@example.com', fullName: 'Mesaj Sahibi' },
  })
  ownerId = owner.id
  await prisma.companyMembership.create({
    data: { userId: ownerId, companyId, role: 'OWNER', acceptedAt: new Date() },
  })
}, 120_000)

describe('ADR-028 · no messaging before acceptance', () => {
  it('refuses to send into a PENDING request, then allows the identical send after acceptance', async () => {
    const requestId = await requestInStatus('PENDING')

    const refused = await sendMessageAsCustomer(customerActor(), {
      offerRequestId: requestId,
      body: 'Merhaba, bir sorum var.',
    })
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.error.kind).toBe('PRECONDITION')

    // No thread row materialised either — the channel does not exist, not merely closed.
    expect(await getPrisma().thread.findUnique({ where: { offerRequestId: requestId } })).toBeNull()

    await getPrisma().offerRequest.update({
      where: { id: requestId },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    })

    const allowed = await sendMessageAsCustomer(customerActor(), {
      offerRequestId: requestId,
      body: 'Merhaba, bir sorum var.',
    })
    expect(allowed.ok).toBe(true)
  }, 60_000)

  it('the company side is refused the same way', async () => {
    const requestId = await requestInStatus('PENDING')

    const refused = await sendMessageAsCompany(companyActor(), {
      offerRequestId: requestId,
      body: 'Telefonunuz nedir?',
    })
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.error.kind).toBe('PRECONDITION')
  }, 60_000)
})

describe('the thread', () => {
  it('carries both sides, marks the other side read on list, and stays one per request', async () => {
    const requestId = await requestInStatus('ACCEPTED')

    await sendMessageAsCustomer(customerActor(), { offerRequestId: requestId, body: 'İlk mesaj' })
    await sendMessageAsCompany(companyActor(), { offerRequestId: requestId, body: 'Yanıt' })

    expect(await getPrisma().thread.count({ where: { offerRequestId: requestId } })).toBe(1)

    const customerView = await listThreadAsCustomer(customerActor(), {
      offerRequestId: requestId,
    })
    expect(customerView.ok).toBe(true)
    if (!customerView.ok) return
    expect(customerView.value.messages.map((message) => message.sender)).toEqual([
      'customer',
      'company',
    ])
    expect(customerView.value.canSend).toBe(true)

    // The customer's list marked the COMPANY message read; the customer's own stays until
    // the company reads.
    const rows = await getPrisma().message.findMany({
      where: { thread: { offerRequestId: requestId } },
      orderBy: { sentAt: 'asc' },
    })
    expect(rows[1]?.readAt).not.toBeNull()

    const companyView = await listThreadAsCompany(companyActor(), { offerRequestId: requestId })
    expect(companyView.ok).toBe(true)
    const afterCompanyRead = await getPrisma().message.findMany({
      where: { thread: { offerRequestId: requestId } },
      orderBy: { sentAt: 'asc' },
    })
    expect(afterCompanyRead[0]?.readAt).not.toBeNull()
  }, 60_000)

  it('a stranger gets NOT_FOUND, never a confirmation the request exists', async () => {
    const requestId = await requestInStatus('ACCEPTED')

    const read = await listThreadAsCustomer(outsiderActor(), { offerRequestId: requestId })
    expect(read.ok).toBe(false)
    if (!read.ok) expect(read.error.kind).toBe('NOT_FOUND')

    const write = await sendMessageAsCustomer(outsiderActor(), {
      offerRequestId: requestId,
      body: 'sızma denemesi',
    })
    expect(write.ok).toBe(false)
    if (!write.ok) expect(write.error.kind).toBe('NOT_FOUND')
  }, 60_000)

  it('closes for sending in a terminal state while the transcript stays readable', async () => {
    const requestId = await requestInStatus('ACCEPTED')
    await sendMessageAsCustomer(customerActor(), { offerRequestId: requestId, body: 'kayıt' })

    await getPrisma().offerRequest.update({ where: { id: requestId }, data: { status: 'WON' } })

    const send = await sendMessageAsCustomer(customerActor(), {
      offerRequestId: requestId,
      body: 'geç mesaj',
    })
    expect(send.ok).toBe(false)
    if (!send.ok) expect(send.error.kind).toBe('PRECONDITION')

    const list = await listThreadAsCustomer(customerActor(), { offerRequestId: requestId })
    expect(list.ok).toBe(true)
    if (!list.ok) return
    expect(list.value.canSend).toBe(false)
    expect(list.value.messages).toHaveLength(1)
  }, 60_000)

  it('rate-limits at 60 messages per hour per thread', async () => {
    const requestId = await requestInStatus('ACCEPTED')
    const first = await sendMessageAsCustomer(customerActor(), {
      offerRequestId: requestId,
      body: 'mesaj 1',
    })
    expect(first.ok).toBe(true)

    const thread = await getPrisma().thread.findUniqueOrThrow({
      where: { offerRequestId: requestId },
    })
    // Fill the hour's budget directly — sending 59 through the service is slow theatre.
    await getPrisma().message.createMany({
      data: Array.from({ length: 59 }, (_, index) => ({
        threadId: thread.id,
        senderUserId: customerId,
        body: `doldurma ${index}`,
      })),
    })

    const overLimit = await sendMessageAsCustomer(customerActor(), {
      offerRequestId: requestId,
      body: 'mesaj 61',
    })
    expect(overLimit.ok).toBe(false)
    if (!overLimit.ok) expect(overLimit.error.kind).toBe('RATE_LIMITED')
  }, 60_000)

  it('notifies the other side on the first unread message only', async () => {
    const requestId = await requestInStatus('ACCEPTED')

    await sendMessageAsCustomer(customerActor(), { offerRequestId: requestId, body: 'bir' })
    await sendMessageAsCustomer(customerActor(), { offerRequestId: requestId, body: 'iki' })

    // Two messages, both unread by the company → ONE notification (`15` §Notifications).
    const afterBurst = await getPrisma().notification.count({
      where: {
        userId: ownerId,
        type: 'message_received',
        payload: { path: ['offerRequestId'], equals: requestId },
      },
    })
    expect(afterBurst).toBe(1)

    // The company reads, then a new message arrives → a second notification.
    await listThreadAsCompany(companyActor(), { offerRequestId: requestId })
    await sendMessageAsCustomer(customerActor(), { offerRequestId: requestId, body: 'üç' })

    const afterRead = await getPrisma().notification.count({
      where: {
        userId: ownerId,
        type: 'message_received',
        payload: { path: ['offerRequestId'], equals: requestId },
      },
    })
    expect(afterRead).toBe(2)
  }, 60_000)
})
