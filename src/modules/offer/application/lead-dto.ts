/**
 * The disclosure boundary for contact data — task 6.5, `11` §Contact disclosure,
 * `CLAUDE.md` non-negotiable 8.
 *
 * `26`, in bold: *"The DTO boundary **is** the KVKK control. If a `PENDING` DTO ever
 * carries a phone number, no amount of frontend fixes it."* Same construction as
 * `pricing/application/estimate-dto.ts`, for the same reason: a rule about a **type**
 * survives refactoring; a rule about a code review does not.
 *
 * Two DTOs, one route: the service returns `PendingLeadView` before acceptance and
 * `AcceptedLeadView` after, and the pending one is *provably* incapable of carrying a
 * contact field — any property named like one is `never`, which no value satisfies.
 * `manufacturer_request_detail_new_lead` and `manufacturer_request_detail` are the two
 * screens these feed (`07` §Route map).
 */

/**
 * Property names that must never appear in a pre-disclosure payload. By name, because that
 * is what survives refactoring — a reviewer renaming `contact` to `customerDetails` is
 * exactly the case a structural check would miss. `addressNote` is here too: `11` releases
 * the district before acceptance, never the exact address.
 */
type ForbiddenContactKey =
  | 'contact'
  | 'customer'
  | 'customerName'
  | 'customerEmail'
  | 'customerPhone'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'address'
  | 'addressNote'
  | 'addressLine'

/** `T` with a compile error on any contact-shaped key. */
export type NoContactFields<T> = {
  [K in keyof T]: K extends ForbiddenContactKey ? never : T[K]
}

/**
 * What both sides of the boundary share: the project, never the person. `11`: *"the
 * manufacturer sees project data only: product, dimensions, options, district, timing,
 * photos — never name, phone, email, or exact address."*
 */
export type LeadProject = {
  projectId: string
  productId: string
  widthMm: number | null
  depthMm: number | null
  heightMm: number | null
  areaM2: number | null
  quantity: number
  cityName: string | null
  districtName: string | null
  timing: string | null
  note: string | null
  selectedOptionIds: string[]
}

/** The request row's non-personal facts. */
type LeadRequestBase = {
  offerRequestId: string
  status: string
  slaExpiresAt: Date
  createdAt: Date
  project: NoContactFields<LeadProject>
}

/** Before acceptance — `manufacturer_request_detail_new_lead`. */
export type PendingLeadView = NoContactFields<
  LeadRequestBase & {
    kind: 'pending'
  }
>

/** From `ACCEPTED` on — `manufacturer_request_detail`. The contact block exists only here. */
export type AcceptedLeadView = LeadRequestBase & {
  kind: 'accepted'
  contactDisclosedAt: Date
  contact: {
    fullName: string | null
    email: string
    phone: string | null
  }
}

export type LeadView = PendingLeadView | AcceptedLeadView

/**
 * The only supported way to build the pending view. A function rather than a spread at the
 * call site, so adding a field to the row cannot leak it by default — the compiler stops a
 * forbidden name here, before any request is served.
 */
export function toPendingLead(input: {
  offerRequestId: string
  status: string
  slaExpiresAt: Date
  createdAt: Date
  project: LeadProject
}): PendingLeadView {
  return {
    kind: 'pending',
    offerRequestId: input.offerRequestId,
    status: input.status,
    slaExpiresAt: input.slaExpiresAt,
    createdAt: input.createdAt,
    project: input.project,
  }
}

export function toAcceptedLead(input: {
  offerRequestId: string
  status: string
  slaExpiresAt: Date
  createdAt: Date
  contactDisclosedAt: Date
  project: LeadProject
  contact: { fullName: string | null; email: string; phone: string | null }
}): AcceptedLeadView {
  return {
    kind: 'accepted',
    offerRequestId: input.offerRequestId,
    status: input.status,
    slaExpiresAt: input.slaExpiresAt,
    createdAt: input.createdAt,
    contactDisclosedAt: input.contactDisclosedAt,
    project: input.project,
    contact: input.contact,
  }
}
