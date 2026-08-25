import 'server-only'

import {} from 'zod'

import { authorize } from '@/modules/iam/application/authorization'
import { PERMISSIONS } from '@/modules/iam/domain/permissions'
import { notify } from '@/modules/notification/infrastructure/notify'
import type { ActorContext } from '@/shared/context/actor'
import { prisma } from '@/shared/db'
import {
  err,
  notFound,
  ok,
  precondition,
  rateLimited,
  type Result,
  type DomainError,
} from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

import { type ListThreadInput, type SendMessageInput, type ThreadView } from './dto'

import type { OfferRequestStatus } from '@/modules/offer/domain/state-machine'

/**
 * Messaging — `15-messaging.md`, task 7.1 second half, and **`ADR-028` is the load-bearing
 * rule**: a thread exists only from `ACCEPTED`. Phase 6 spent five tasks making sure a
 * manufacturer sees no contact data before acceptance — down to the free-text note
 * (`ADR-026`) — and a pre-acceptance message box would reopen that channel in both
 * directions ("what is your phone number?"). So the boundary here is not a UI choice:
 * `sendMessage*` on a `PENDING` request is a `PRECONDITION` error, locked by an
 * integration test, and the thread row itself cannot exist before acceptance because only
 * this service creates it.
 *
 * After `ACCEPTED`, contact is already lawfully disclosed, so there is deliberately **no
 * content filtering** (`15` §Contact-detail leakage): a digit-pattern scrubber is a
 * false-positive machine that protects nothing the lifecycle does not already protect.
 *
 * Reading marks the *other side's* messages read (`15`: any company member reading marks
 * it read for the company) — done in the list call rather than a separate endpoint, which
 * keeps the polling loop at one request. Sending closes in the terminal states but the
 * thread stays readable forever: it is part of the engagement record.
 */

/** `15` §Rules: sending is open from acceptance until a terminal state. */
const SEND_OPEN_STATES: readonly OfferRequestStatus[] = [
  'ACCEPTED',
  'SURVEY_SCHEDULED',
  'SURVEY_COMPLETED',
  'OFFER_SENT',
  'OFFER_ACCEPTED',
  'OFFER_REJECTED',
]

/** States in which no thread can exist at all — before acceptance (`ADR-028`). */
const PRE_ACCEPTANCE_STATES: readonly OfferRequestStatus[] = ['PENDING']

const MESSAGES_PER_HOUR_PER_THREAD = 60

// The contract lives in ./dto (CLAUDE.md §Conventions, extracted in 11.2); re-exported
// here so every existing import site keeps working.
export * from './dto'

type Side = 'customer' | 'company'

async function loadRequestFor(
  actor: ActorContext,
  offerRequestId: string,
  side: Side,
): Promise<
  Result<
    { id: string; status: OfferRequestStatus; customerId: string; companyId: string },
    DomainError
  >
> {
  // Ownership in the where clause (`12` rule 2): the wrong side gets NOT_FOUND, never a
  // confirmation that the request exists.
  const where =
    side === 'customer'
      ? { id: offerRequestId, customerId: actor.userId ?? '' }
      : { id: offerRequestId, companyId: actor.companyId ?? '' }

  const request = await prisma.offerRequest.findFirst({
    where,
    select: { id: true, status: true, customerId: true, companyId: true },
  })
  if (request === null) return err(notFound('OfferRequest'))
  return ok(request)
}

async function send(
  actor: ActorContext,
  input: SendMessageInput,
  side: Side,
): Promise<Result<{ messageId: string; sentAt: Date }, DomainError>> {
  if (actor.userId === null) return err(notFound('OfferRequest'))

  const loaded = await loadRequestFor(actor, input.offerRequestId, side)
  if (!loaded.ok) return loaded
  const request = loaded.value

  if (PRE_ACCEPTANCE_STATES.includes(request.status)) {
    // ADR-028's lock. Not NOT_FOUND: the customer owns this request and may see it —
    // what does not exist yet is the channel.
    return err(precondition('Mesajlaşma, talep kabul edildikten sonra açılır (ADR-028).'))
  }
  if (!SEND_OPEN_STATES.includes(request.status)) {
    return err(
      precondition(
        'Bu talep kapandı; yazışma geçmişi okunabilir kalır ama yeni mesaj gönderilemez.',
      ),
    )
  }

  const outcome = await prisma.$transaction(async (tx) => {
    // Lazy creation, race-safe through the UNIQUE on offerRequestId: two first messages
    // colliding both land in the same thread.
    const thread = await tx.thread.upsert({
      where: { offerRequestId: request.id },
      create: { offerRequestId: request.id },
      update: {},
      select: { id: true },
    })

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recent = await tx.message.count({
      where: { threadId: thread.id, senderUserId: actor.userId ?? '', sentAt: { gte: hourAgo } },
    })
    if (recent >= MESSAGES_PER_HOUR_PER_THREAD) {
      return { kind: 'rate-limited' as const }
    }

    // Does the receiving side already have unread mail from us? `15` §Notifications:
    // only the FIRST unread message notifies — a burst of ten is one notification.
    const unreadBefore = await tx.message.count({
      where: { threadId: thread.id, senderUserId: actor.userId ?? '', readAt: null },
    })

    const message = await tx.message.create({
      data: { threadId: thread.id, senderUserId: actor.userId ?? '', body: input.body },
      select: { id: true, sentAt: true },
    })

    return { kind: 'sent' as const, message, firstUnread: unreadBefore === 0 }
  })

  if (outcome.kind === 'rate-limited') return err(rateLimited(60 * 60))

  // ── notifications AFTER commit (the Phase 6 rule) ──────────────────────────
  if (outcome.firstUnread) {
    if (side === 'customer') {
      const [owners, customer] = await Promise.all([
        prisma.companyMembership.findMany({
          where: { companyId: request.companyId, role: 'OWNER' },
          select: { userId: true },
        }),
        prisma.user.findUniqueOrThrow({
          where: { id: request.customerId },
          select: { fullName: true },
        }),
      ])
      for (const owner of owners) {
        await notify({
          userId: owner.userId,
          type: 'message_received',
          payload: { senderName: customer.fullName ?? 'Müşteri', offerRequestId: request.id },
        })
      }
    } else {
      const company = await prisma.company.findUniqueOrThrow({
        where: { id: request.companyId },
        select: { displayName: true },
      })
      await notify({
        userId: request.customerId,
        type: 'message_received',
        payload: { senderName: company.displayName, offerRequestId: request.id },
      })
    }
  }

  return ok({ messageId: outcome.message.id, sentAt: outcome.message.sentAt })
}

async function listThread(
  actor: ActorContext,
  input: ListThreadInput,
  side: Side,
): Promise<Result<ThreadView, DomainError>> {
  if (actor.userId === null) return err(notFound('OfferRequest'))

  const loaded = await loadRequestFor(actor, input.offerRequestId, side)
  if (!loaded.ok) return loaded
  const request = loaded.value

  const thread = await prisma.thread.findUnique({
    where: { offerRequestId: request.id },
    select: { id: true },
  })

  const canSend = SEND_OPEN_STATES.includes(request.status)

  if (thread === null) {
    return ok({ offerRequestId: request.id, requestStatus: request.status, canSend, messages: [] })
  }

  let sentAfter: Date | undefined
  if (input.after !== undefined) {
    const cursor = await prisma.message.findFirst({
      where: { id: input.after, threadId: thread.id },
      select: { sentAt: true },
    })
    sentAfter = cursor?.sentAt
  }

  const readerSideUserId = side === 'customer' ? request.customerId : null
  const rows = await prisma.message.findMany({
    where: {
      threadId: thread.id,
      ...(sentAfter === undefined ? {} : { sentAt: { gt: sentAfter } }),
    },
    orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
    select: { id: true, senderUserId: true, body: true, sentAt: true, readAt: true },
  })

  // Reading marks the OTHER side's messages read — one updateMany, part of the same poll.
  await prisma.message.updateMany({
    where: {
      threadId: thread.id,
      readAt: null,
      ...(side === 'customer'
        ? { NOT: { senderUserId: request.customerId } }
        : { senderUserId: request.customerId }),
    },
    data: { readAt: new Date() },
  })

  void readerSideUserId

  return ok({
    offerRequestId: request.id,
    requestStatus: request.status,
    canSend,
    messages: rows.map((row) => ({
      id: row.id,
      sender: row.senderUserId === request.customerId ? 'customer' : 'company',
      body: row.body,
      sentAt: row.sentAt,
      readAt: row.readAt,
    })),
  })
}

// ── registered methods ────────────────────────────────────────────────────────

export const sendMessageAsCustomer = serviceMethod<
  SendMessageInput,
  { messageId: string; sentAt: Date }
>(
  'messaging',
  'sendMessageAsCustomer',
  {
    kind: 'customer-owned',
    describe: 'a customer writes only into threads on their own accepted requests',
    scopedBy: ['userId'],
  },
  async (actor, input) => send(actor, input, 'customer'),
)

export const sendMessageAsCompany = serviceMethod<
  SendMessageInput,
  { messageId: string; sentAt: Date }
>(
  'messaging',
  'sendMessageAsCompany',
  { kind: 'permission', permission: PERMISSIONS.MESSAGE_SEND },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.MESSAGE_SEND)
    if (!allowed.ok) return err(allowed.error)
    return send(actor, input, 'company')
  },
)

export const listThreadAsCustomer = serviceMethod<ListThreadInput, ThreadView>(
  'messaging',
  'listThreadAsCustomer',
  {
    kind: 'customer-owned',
    describe: 'a customer reads only threads on their own requests',
    scopedBy: ['userId'],
  },
  async (actor, input) => listThread(actor, input, 'customer'),
)

export const listThreadAsCompany = serviceMethod<ListThreadInput, ThreadView>(
  'messaging',
  'listThreadAsCompany',
  { kind: 'permission', permission: PERMISSIONS.MESSAGE_SEND },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.MESSAGE_SEND)
    if (!allowed.ok) return err(allowed.error)
    return listThread(actor, input, 'company')
  },
)
