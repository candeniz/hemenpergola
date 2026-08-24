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
 *
 * **The free-text `note` sits on the accepted side** (`ADR-026`). It is the wizard's
 * 2000-character field, and customers write "call me on 0532…" and street addresses into
 * exactly such fields — so pre-acceptance it is contact data wearing a project hat.
 * Pattern-scrubbing it was rejected as unwinnable; it simply crosses with the disclosure.
 *
 * **Belt and braces**: `NoContactFields` is compile-time, and the builders below `pick`
 * every field by name at runtime — a new column on the query cannot ride into a DTO
 * through a spread; someone has to write the line that carries it.
 */

/**
 * Property names that must never appear in a pre-disclosure payload. By name, because that
 * is what survives refactoring — a reviewer renaming `contact` to `customerDetails` is
 * exactly the case a structural check would miss. `addressNote` is here too: `11` releases
 * the district before acceptance, never the exact address. `note` joined by `ADR-026`.
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
  | 'note'

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
  selectedOptionIds: string[]
}

/** The runtime pick behind both builders — one list, every field deliberate. */
function pickLeadProject(project: LeadProject): LeadProject {
  return {
    projectId: project.projectId,
    productId: project.productId,
    widthMm: project.widthMm,
    depthMm: project.depthMm,
    heightMm: project.heightMm,
    areaM2: project.areaM2,
    quantity: project.quantity,
    cityName: project.cityName,
    districtName: project.districtName,
    timing: project.timing,
    selectedOptionIds: [...project.selectedOptionIds],
  }
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
  /** The customer's free text — accepted side only (`ADR-026`). */
  customerNote: string | null
}

export type LeadView = PendingLeadView | AcceptedLeadView

/**
 * The only supported way to build the pending view. Field-by-field on purpose: the type
 * stops a forbidden *name* at compile time, and the pick stops an unforeseen *value* at
 * runtime — `project: input.project` would serialise whatever the query happened to fetch.
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
    project: pickLeadProject(input.project),
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
  customerNote: string | null
}): AcceptedLeadView {
  return {
    kind: 'accepted',
    offerRequestId: input.offerRequestId,
    status: input.status,
    slaExpiresAt: input.slaExpiresAt,
    createdAt: input.createdAt,
    contactDisclosedAt: input.contactDisclosedAt,
    project: pickLeadProject(input.project),
    contact: {
      fullName: input.contact.fullName,
      email: input.contact.email,
      phone: input.contact.phone,
    },
    customerNote: input.customerNote,
  }
}
