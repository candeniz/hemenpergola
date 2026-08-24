import 'server-only'

import { z } from 'zod'

import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { authorize } from '@/modules/iam/application/authorization'
import { PERMISSIONS } from '@/modules/iam/domain/permissions'
import { prisma } from '@/shared/db'
import { notify } from '@/modules/notification/infrastructure/notify'
import { enqueue, JOB } from '@/shared/jobs'
import { CONTACT_SHARING_TEXT_VERSION } from '@/shared/legal/consent-version'
import { conflict, err, notFound, ok, precondition } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

import { statusAfterSubmission } from '@/modules/project/domain/status'

import { transition, type OfferRequestStatus } from '../domain/state-machine'

// Re-exported for app/: pages and actions may not reach into domain, even for a type the
// lint rule cannot tell apart from a value import.
export type { OfferRequestStatus } from '../domain/state-machine'

import {
  toAcceptedLead,
  toPendingLead,
  type AcceptedLeadView,
  type LeadProject,
  type LeadView,
} from './lead-dto'

/**
 * The offer-request service — tasks 6.2–6.5, `11-offer-request-lifecycle.md`
 * §Implementation, followed to the letter:
 *
 *   1 · load the request `FOR UPDATE`
 *   2 · `transition(...)` — the pure machine answers, or `CONFLICT`
 *   3 · side effects inside the transaction (disclosure row, audit entries)
 *   4 · notifications AFTER commit, never inside
 *
 * Step 4 is not a style point: a notification sent inside the transaction is sent even
 * when the transaction rolls back, and "the manufacturer accepted" mailed to a customer
 * about a request that was never accepted cannot be unsent. The behavioural proof is in
 * the integration suite: the loser of a concurrent accept/decline race produces no
 * notification row at all.
 *
 * ## The disclosure (task 6.4, `CLAUDE.md` non-negotiable 8)
 *
 * `PENDING → ACCEPTED` releases contact data exactly once, and the four things `19`
 * requires — the consent it happens under, the `ContactDisclosure` row naming the exact
 * fields, the `AuditLog` entry, the customer notification — are one transaction (the first
 * three) plus the post-commit notification. The audit write is **not** the best-effort
 * `recordAudit`: `19` calls these entries mandatory, so it is a plain insert inside the
 * caller's transaction and a failure rolls the acceptance back with it. Belt and braces,
 * `ContactDisclosure.offerRequestId` is UNIQUE — a second row is impossible even if every
 * lock failed.
 *
 * ## The DTO boundary (task 6.5)
 *
 * One read route, two shapes: `PendingLeadView` cannot carry a contact field at the type
 * level (`lead-dto.ts`), and the pending read never SELECTs the customer at all — the data
 * that must not appear is data this code path does not hold.
 */

// ── schemas ──────────────────────────────────────────────────────────────────

export const createOfferRequestsSchema = z.object({
  projectId: z.string().min(1),
  companyIds: z.array(z.string().min(1)).min(1).max(5),
  consent: z.object({
    /**
     * `06`: `consent.accepted !== true` → 422. `literal(true)` makes the invalid shape
     * unrepresentable rather than checked.
     */
    accepted: z.literal(true),
    textVersion: z.string().min(1),
  }),
})
export type CreateOfferRequestsInput = z.infer<typeof createOfferRequestsSchema>

export const respondSchema = z.object({ offerRequestId: z.string().min(1) })
export type RespondInput = z.infer<typeof respondSchema>

export const declineSchema = z.object({
  offerRequestId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
})
export type DeclineInput = z.infer<typeof declineSchema>

export const getLeadSchema = z.object({ offerRequestId: z.string().min(1) })
export type GetLeadInput = z.infer<typeof getLeadSchema>

export type CreateOfferRequestsResult = {
  created: { offerRequestId: string; companyId: string }[]
  slaExpiresAt: Date
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Q7's default, admin-tunable (`ADM-06`). */
async function slaHours(): Promise<number> {
  const row = await prisma.platformSetting.findUnique({
    where: { key: 'offer_request.sla_hours' },
  })
  const value = row?.value
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 48
}

async function maxCompaniesPerProject(): Promise<number> {
  const row = await prisma.platformSetting.findUnique({
    where: { key: 'matching.max_companies_per_project' },
  })
  const value = row?.value
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 5
}

type LeadRow = {
  id: string
  status: OfferRequestStatus
  slaExpiresAt: Date
  createdAt: Date
  contactDisclosedAt: Date | null
  project: {
    id: string
    productId: string
    widthMm: number | null
    depthMm: number | null
    heightMm: number | null
    areaM2: number | null
    quantity: number
    timing: string | null
    city: { name: string } | null
    district: { name: string } | null
    values: { optionId: string | null }[]
  }
}

function leadProject(row: LeadRow['project']): LeadProject {
  return {
    projectId: row.id,
    productId: row.productId,
    widthMm: row.widthMm,
    depthMm: row.depthMm,
    heightMm: row.heightMm,
    areaM2: row.areaM2,
    quantity: row.quantity,
    cityName: row.city?.name ?? null,
    districtName: row.district?.name ?? null,
    timing: row.timing,
    selectedOptionIds: row.values
      .map((value) => value.optionId)
      .filter((optionId): optionId is string => optionId !== null),
  }
}

const LEAD_PROJECT_SELECT = {
  id: true,
  productId: true,
  widthMm: true,
  depthMm: true,
  heightMm: true,
  areaM2: true,
  quantity: true,
  timing: true,
  city: { select: { name: true } },
  district: { select: { name: true } },
  values: { select: { optionId: true } },
} as const

// ── create (customer) ────────────────────────────────────────────────────────

export const createOfferRequests = serviceMethod<
  CreateOfferRequestsInput,
  CreateOfferRequestsResult
>(
  'offer',
  'createOfferRequests',
  {
    kind: 'customer-owned',
    describe: 'requests are created against a project the customer owns, by account only',
    scopedBy: ['userId'],
  },
  async (actor, input) => {
    /*
     * An account, not a cookie: `ADR-021` put the wall exactly here. An anonymous visitor
     * configures; requesting offers is what requires signing up, because the request needs
     * somebody to disclose *to be able to* notify and somebody's consent to record.
     */
    if (actor.userId === null) {
      return err(precondition('requesting offers requires an account'))
    }

    /*
     * The exact text version shown must be the one the repo currently carries. A stale
     * client (open tab across a deploy that changed the text) must re-render the checkbox,
     * not record consent to words the customer never saw.
     */
    if (input.consent.textVersion !== CONTACT_SHARING_TEXT_VERSION) {
      return err(
        precondition('the consent text has changed; please review and accept the current version'),
      )
    }

    const project = await prisma.project.findFirst({
      where: { id: input.projectId, customerId: actor.userId, deletedAt: null },
      select: { id: true, status: true },
    })
    if (project === null) return err(notFound('Project'))

    // `11` §Transition table, the `create` guards: project READY.
    if (project.status !== 'READY' && project.status !== 'SUBMITTED') {
      return err(precondition('offers can be requested once the project is READY'))
    }

    const [cap, hours, companies, activeCount] = await Promise.all([
      maxCompaniesPerProject(),
      slaHours(),
      prisma.company.findMany({
        where: { id: { in: input.companyIds }, deletedAt: null },
        select: { id: true, status: true },
      }),
      /*
       * The per-project cap counts live requests. DECLINED / EXPIRED / CANCELLED free
       * their slots — `11` §SLA says expiry never blocks selecting additional
       * manufacturers, which is only true if the expired ones stop counting.
       */
      prisma.offerRequest.count({
        where: {
          projectId: input.projectId,
          status: { notIn: ['DECLINED', 'EXPIRED', 'CANCELLED'] },
        },
      }),
    ])

    const byId = new Map(companies.map((company) => [company.id, company]))
    for (const companyId of input.companyIds) {
      const company = byId.get(companyId)
      if (company === undefined) return err(notFound('Company'))
      if (company.status !== 'VERIFIED') {
        return err(conflict('offers can only be requested from verified companies'))
      }
    }

    if (activeCount + input.companyIds.length > cap) {
      return err(conflict(`a project may have at most ${cap} live requests; ${activeCount} exist`))
    }

    // The estimate each request rides on, from the latest run — `PRC-02` makes it the
    // number the customer actually saw.
    const latestRun = await prisma.matchRun.findFirst({
      where: { projectId: input.projectId },
      orderBy: { createdAt: 'desc' },
      select: {
        results: {
          where: { companyId: { in: input.companyIds } },
          select: { id: true, companyId: true, priceCalculationId: true },
        },
      },
    })
    const resultByCompany = new Map(
      (latestRun?.results ?? []).map((result) => [result.companyId, result]),
    )

    const slaExpiresAt = new Date(Date.now() + hours * 60 * 60 * 1000)

    let created: { offerRequestId: string; companyId: string }[]
    try {
      created = await prisma.$transaction(async (tx) => {
        const consent = await tx.consent.create({
          data: {
            userId: actor.userId!,
            type: 'CONTACT_SHARING',
            textVersion: input.consent.textVersion,
            ip: actor.ip,
            userAgent: actor.userAgent,
          },
        })

        const rows = await tx.offerRequest.createManyAndReturn({
          data: input.companyIds.map((companyId) => ({
            projectId: input.projectId,
            customerId: actor.userId!,
            companyId,
            consentId: consent.id,
            slaExpiresAt,
            matchResultId: resultByCompany.get(companyId)?.id ?? null,
            priceCalculationId: resultByCompany.get(companyId)?.priceCalculationId ?? null,
          })),
          select: { id: true, companyId: true },
        })

        /*
         * The project moves READY → SUBMITTED with its requests, through its own status
         * module — never a bare write (`CLAUDE.md` non-negotiable 4). Idempotent for the
         * add-more-after-expiry case: SUBMITTED stays SUBMITTED.
         */
        await tx.project.update({
          where: { id: input.projectId },
          data: { status: statusAfterSubmission(project.status) },
        })

        return rows.map((row) => ({ offerRequestId: row.id, companyId: row.companyId }))
      })
    } catch (error) {
      // unique(projectId, companyId): re-sending to the same company is a CONFLICT, and the
      // whole batch rolls back — the consent row included, so no consent floats requestless.
      if ((error as { code?: string }).code === 'P2002') {
        return err(conflict('one of these companies has already been sent this request'))
      }
      throw error
    }

    // ── after commit ──────────────────────────────────────────────────────────
    void recordAudit(actor, {
      entityType: 'Project',
      entityId: input.projectId,
      action: 'offer_request_created',
      after: { companyIds: input.companyIds, slaExpiresAt },
    })

    // Every recipient goes through notify(): the row AND its dispatch, after commit.
    const owners = await prisma.companyMembership.findMany({
      where: { companyId: { in: input.companyIds }, role: 'OWNER' },
      select: { userId: true, companyId: true },
    })
    const projectPlace = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { areaM2: true, city: { select: { name: true } } },
    })
    for (const owner of owners) {
      await notify({
        userId: owner.userId,
        type: 'offer_request_received',
        payload: {
          offerRequestId:
            created.find((row) => row.companyId === owner.companyId)?.offerRequestId ?? null,
          projectId: input.projectId,
          cityName: projectPlace?.city?.name ?? '—',
          areaM2: projectPlace?.areaM2 ?? 0,
        },
      })
    }
    // `13` row 1 has a customer half too — the confirmation Phase 6 never wrote.
    await notify({
      userId: actor.userId!,
      type: 'offer_request_created',
      payload: { projectId: input.projectId, companyCount: input.companyIds.length },
    })

    /*
     * The SLA clock, scheduled at creation (`11` §SLA): reminders at 50% and 90% of the
     * window, then the expiry itself. After commit like the notifications — a rolled-back
     * batch must not leave a live timer — and singleton-keyed so a double submit cannot
     * double the schedule. The handler is idempotent regardless.
     */
    const windowSeconds = hours * 3600
    for (const row of created) {
      await enqueue(
        JOB.slaExpire,
        { offerRequestId: row.offerRequestId, kind: 'reminder_50' },
        {
          startAfterSeconds: Math.floor(windowSeconds * 0.5),
          singletonKey: `sla50:${row.offerRequestId}`,
        },
      )
      await enqueue(
        JOB.slaExpire,
        { offerRequestId: row.offerRequestId, kind: 'reminder_90' },
        {
          startAfterSeconds: Math.floor(windowSeconds * 0.9),
          singletonKey: `sla90:${row.offerRequestId}`,
        },
      )
      await enqueue(
        JOB.slaExpire,
        { offerRequestId: row.offerRequestId, kind: 'expire' },
        { startAfterSeconds: windowSeconds, singletonKey: `slaX:${row.offerRequestId}` },
      )
    }

    return ok({ created, slaExpiresAt })
  },
)

// ── accept (manufacturer) — the disclosure transition ────────────────────────

export const acceptOfferRequest = serviceMethod<RespondInput, AcceptedLeadView>(
  'offer',
  'acceptOfferRequest',
  { kind: 'permission', permission: PERMISSIONS.OFFER_REQUEST_RESPOND },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.OFFER_REQUEST_RESPOND)
    if (!allowed.ok) return err(allowed.error)
    if (actor.companyId === null) return err(notFound('OfferRequest'))

    const outcome = await prisma.$transaction(async (tx) => {
      /*
       * 1 · `FOR UPDATE`, with the company in the WHERE — ownership stays in the query
       * (`CLAUDE.md` non-negotiable 3), and the row lock is what turns a concurrent
       * accept/decline pair into a winner and a 409 instead of a corrupted record (6.10).
       */
      const rows = await tx.$queryRaw<
        {
          id: string
          status: OfferRequestStatus
          slaExpiresAt: Date
          createdAt: Date
          consentId: string
          customerId: string
          projectId: string
        }[]
      >`
        SELECT "id", "status", "slaExpiresAt", "createdAt", "consentId", "customerId", "projectId"
        FROM "OfferRequest"
        WHERE "id" = ${input.offerRequestId} AND "companyId" = ${actor.companyId}
        FOR UPDATE
      `
      const row = rows[0]
      if (row === undefined) return { kind: 'error' as const, error: notFound('OfferRequest') }

      // 2 · the machine answers. A second accept meets status ACCEPTED here and gets its
      // 409 — and, by the same token, writes nothing below.
      const next = transition(row.status, 'accept', {
        now: new Date(),
        actor: 'manufacturer',
        slaExpiresAt: row.slaExpiresAt,
      })
      if (!next.ok) return { kind: 'error' as const, error: next.error }

      // 3 · side effects, in-tx.
      const [customer, projectRow] = await Promise.all([
        tx.user.findUniqueOrThrow({
          where: { id: row.customerId },
          select: { fullName: true, email: true, phone: true },
        }),
        // The free-text note crosses the boundary WITH the disclosure (`ADR-026`), so it is
        // fetched here — on the accepting path — and never by the pending read.
        tx.project.findUniqueOrThrow({ where: { id: row.projectId }, select: { note: true } }),
      ])

      const disclosedFields = [
        ...(customer.fullName !== null ? ['fullName'] : []),
        'email',
        ...(customer.phone !== null ? ['phone'] : []),
      ]
      const disclosedAt = new Date()

      const updated = await tx.offerRequest.update({
        where: { id: row.id },
        data: { status: next.value, respondedAt: disclosedAt, contactDisclosedAt: disclosedAt },
        select: {
          id: true,
          status: true,
          slaExpiresAt: true,
          createdAt: true,
          contactDisclosedAt: true,
          project: { select: LEAD_PROJECT_SELECT },
        },
      })

      await tx.contactDisclosure.create({
        data: {
          offerRequestId: row.id,
          companyId: actor.companyId!,
          disclosedFields,
          consentId: row.consentId,
          disclosedAt,
        },
      })

      /*
       * The mandatory audit entries, as plain inserts INSIDE this transaction — `19`
       * §Audit counts the disclosure among the entries that must exist, so its failure
       * must roll the acceptance back, which the best-effort `recordAudit` (deliberately)
       * cannot promise.
       */
      await tx.auditLog.createMany({
        data: [
          {
            actorUserId: actor.userId,
            actorRole: actor.globalRole ?? 'anonymous',
            companyId: actor.companyId,
            entityType: 'OfferRequest',
            entityId: row.id,
            action: 'offer_request_accepted',
            ip: actor.ip,
            userAgent: actor.userAgent,
          },
          {
            actorUserId: actor.userId,
            actorRole: actor.globalRole ?? 'anonymous',
            companyId: actor.companyId,
            entityType: 'OfferRequest',
            entityId: row.id,
            action: 'contact_disclosed',
            after: { disclosedFields, consentId: row.consentId },
            ip: actor.ip,
            userAgent: actor.userAgent,
          },
        ],
      })

      return {
        kind: 'accepted' as const,
        row: updated,
        customer,
        customerNote: projectRow.note,
        customerId: row.customerId,
        companyId: actor.companyId!,
        disclosedFields,
        disclosedAt,
      }
    })

    if (outcome.kind === 'error') return err(outcome.error)

    /*
     * 4 · the notification, AFTER the commit — `19`: the data subject is told their
     * details were shared, with whom, and when. The integration suite's race test leans on
     * this ordering: the losing branch above returned before this line, so it wrote none.
     */
    const companyName = (
      await prisma.company.findUniqueOrThrow({
        where: { id: outcome.companyId },
        select: { displayName: true },
      })
    ).displayName
    await notify({
      userId: outcome.customerId,
      type: 'contact_disclosed',
      payload: {
        offerRequestId: outcome.row.id,
        companyId: outcome.companyId,
        companyName,
        disclosedFields: outcome.disclosedFields,
        disclosedAt: outcome.disclosedAt,
      },
    })

    // 7.3: the accept changed this company's response latency and engagement history.
    await enqueue(
      JOB.analyticsRefresh,
      { companyId: outcome.companyId },
      { singletonKey: `analytics:${outcome.companyId}` },
    )

    return ok(
      toAcceptedLead({
        offerRequestId: outcome.row.id,
        status: outcome.row.status,
        slaExpiresAt: outcome.row.slaExpiresAt,
        createdAt: outcome.row.createdAt,
        contactDisclosedAt: outcome.row.contactDisclosedAt ?? outcome.disclosedAt,
        project: leadProject(outcome.row.project),
        contact: {
          fullName: outcome.customer.fullName,
          email: outcome.customer.email,
          phone: outcome.customer.phone,
        },
        customerNote: outcome.customerNote,
      }),
    )
  },
)

// ── decline (manufacturer) ───────────────────────────────────────────────────

export const declineOfferRequest = serviceMethod<
  DeclineInput,
  { offerRequestId: string; status: OfferRequestStatus }
>(
  'offer',
  'declineOfferRequest',
  { kind: 'permission', permission: PERMISSIONS.OFFER_REQUEST_RESPOND },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.OFFER_REQUEST_RESPOND)
    if (!allowed.ok) return err(allowed.error)
    if (actor.companyId === null) return err(notFound('OfferRequest'))

    const outcome = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; status: OfferRequestStatus; slaExpiresAt: Date; customerId: string }[]
      >`
        SELECT "id", "status", "slaExpiresAt", "customerId"
        FROM "OfferRequest"
        WHERE "id" = ${input.offerRequestId} AND "companyId" = ${actor.companyId}
        FOR UPDATE
      `
      const row = rows[0]
      if (row === undefined) return { kind: 'error' as const, error: notFound('OfferRequest') }

      const next = transition(row.status, 'decline', {
        now: new Date(),
        actor: 'manufacturer',
        slaExpiresAt: row.slaExpiresAt,
        reason: input.reason,
      })
      if (!next.ok) return { kind: 'error' as const, error: next.error }

      await tx.offerRequest.update({
        where: { id: row.id },
        data: { status: next.value, respondedAt: new Date(), declineReason: input.reason },
      })

      return {
        kind: 'declined' as const,
        id: row.id,
        customerId: row.customerId,
        status: next.value,
      }
    })

    if (outcome.kind === 'error') return err(outcome.error)

    // After commit: the decision is audited (best-effort — no disclosure happened) and the
    // customer is told, so they can pick another manufacturer (`11` §SLA).
    void recordAudit(actor, {
      entityType: 'OfferRequest',
      entityId: outcome.id,
      action: 'offer_request_declined',
      reason: input.reason,
    })
    await notify({
      userId: outcome.customerId,
      type: 'offer_request_declined',
      payload: {
        offerRequestId: outcome.id,
        reason: input.reason,
        companyName: (
          await prisma.company.findUniqueOrThrow({
            where: { id: actor.companyId! },
            select: { displayName: true },
          })
        ).displayName,
      },
    })

    // 7.3: a decline is a response too — the median must see it.
    await enqueue(
      JOB.analyticsRefresh,
      { companyId: actor.companyId! },
      { singletonKey: `analytics:${actor.companyId!}` },
    )

    return ok({ offerRequestId: outcome.id, status: outcome.status })
  },
)

// ── read (manufacturer) — one route, two DTOs ────────────────────────────────

export const getLeadForCompany = serviceMethod<GetLeadInput, LeadView>(
  'offer',
  'getLeadForCompany',
  { kind: 'permission', permission: PERMISSIONS.OFFER_REQUEST_READ },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.OFFER_REQUEST_READ)
    if (!allowed.ok) return err(allowed.error)
    if (actor.companyId === null) return err(notFound('OfferRequest'))

    /*
     * The pending read never selects the customer relation at all: the field that must not
     * appear in the DTO is a field this query does not fetch. Only once the status says
     * the disclosure happened is the second, contact-bearing query made.
     */
    const row = await prisma.offerRequest.findFirst({
      where: { id: input.offerRequestId, companyId: actor.companyId },
      select: {
        id: true,
        status: true,
        slaExpiresAt: true,
        createdAt: true,
        contactDisclosedAt: true,
        customerId: true,
        project: { select: LEAD_PROJECT_SELECT },
      },
    })
    if (row === null) return err(notFound('OfferRequest'))

    const base = {
      offerRequestId: row.id,
      status: row.status,
      slaExpiresAt: row.slaExpiresAt,
      createdAt: row.createdAt,
      project: leadProject(row.project),
    }

    if (row.contactDisclosedAt === null) {
      return ok(toPendingLead(base))
    }

    const [customer, projectNote] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: row.customerId },
        select: { fullName: true, email: true, phone: true },
      }),
      prisma.project.findUniqueOrThrow({
        where: { id: row.project.id },
        select: { note: true },
      }),
    ])

    return ok(
      toAcceptedLead({
        ...base,
        contactDisclosedAt: row.contactDisclosedAt,
        contact: {
          fullName: customer.fullName,
          email: customer.email,
          phone: customer.phone,
        },
        customerNote: projectNote.note,
      }),
    )
  },
)

// ── list (manufacturer) — the inbox, contact-free by construction ────────────

export const listLeadsSchema = z.object({}).optional()
export type ListLeadsInput = z.infer<typeof listLeadsSchema>

export type LeadListItem = {
  offerRequestId: string
  status: OfferRequestStatus
  slaExpiresAt: Date
  createdAt: Date
  productId: string
  areaM2: number | null
  cityName: string | null
  districtName: string | null
}

export const listLeadsForCompany = serviceMethod<ListLeadsInput, { leads: LeadListItem[] }>(
  'offer',
  'listLeadsForCompany',
  { kind: 'permission', permission: PERMISSIONS.OFFER_REQUEST_READ },
  async (actor, input) => {
    void input
    const allowed = authorize(actor, PERMISSIONS.OFFER_REQUEST_READ)
    if (!allowed.ok) return err(allowed.error)
    if (actor.companyId === null) return ok({ leads: [] })

    const rows = await prisma.offerRequest.findMany({
      where: { companyId: actor.companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        status: true,
        slaExpiresAt: true,
        createdAt: true,
        project: {
          select: {
            productId: true,
            areaM2: true,
            city: { select: { name: true } },
            district: { select: { name: true } },
          },
        },
      },
    })

    return ok({
      leads: rows.map((row) => ({
        offerRequestId: row.id,
        status: row.status,
        slaExpiresAt: row.slaExpiresAt,
        createdAt: row.createdAt,
        productId: row.project.productId,
        areaM2: row.project.areaM2,
        cityName: row.project.city?.name ?? null,
        districtName: row.project.district?.name ?? null,
      })),
    })
  },
)

// ── list (customer) — the request tracker on the project page ────────────────

export const listRequestsForProjectSchema = z.object({ projectId: z.string().min(1) })
export type ListRequestsForProjectInput = z.infer<typeof listRequestsForProjectSchema>

export type CustomerRequestListItem = {
  offerRequestId: string
  companyId: string
  companyName: string
  status: OfferRequestStatus
  slaExpiresAt: Date
  createdAt: Date
}

export const listRequestsForProject = serviceMethod<
  ListRequestsForProjectInput,
  { requests: CustomerRequestListItem[] }
>(
  'offer',
  'listRequestsForProject',
  {
    kind: 'customer-owned',
    describe: 'a customer lists only the requests of a project they own',
    scopedBy: ['userId'],
  },
  async (actor, input) => {
    if (actor.userId === null) return ok({ requests: [] })

    const rows = await prisma.offerRequest.findMany({
      where: { projectId: input.projectId, customerId: actor.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        companyId: true,
        status: true,
        slaExpiresAt: true,
        createdAt: true,
        company: { select: { displayName: true } },
      },
    })

    return ok({
      requests: rows.map((row) => ({
        offerRequestId: row.id,
        companyId: row.companyId,
        companyName: row.company.displayName,
        status: row.status,
        slaExpiresAt: row.slaExpiresAt,
        createdAt: row.createdAt,
      })),
    })
  },
)

export const offerRequestService = {
  createOfferRequests,
  acceptOfferRequest,
  declineOfferRequest,
  getLeadForCompany,
  listLeadsForCompany,
  listRequestsForProject,
} satisfies Record<string, { meta: unknown }>
