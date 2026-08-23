import 'server-only'

import { z } from 'zod'

import { prisma } from '@/shared/db'
import { conflict, err, notFound, ok, precondition } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'
import type { ActorContext } from '@/shared/context/actor'
import { MAX_ANONYMOUS_DRAFTS_PER_KEY } from '@/shared/context/anonymous-key'

import { checkReadiness, type ReadinessResult } from '../domain/readiness'
import {
  canEdit,
  statusAfterEdit,
  statusAfterValidation,
  type ProjectStatus,
} from '../domain/status'
import { deriveAreaM2, isStep, STEP_SCHEMAS, type Step } from '../domain/steps'

/**
 * The configurator's service — tasks 4.1, 4.2, 4.3, 4.4 and 4.7.
 *
 * ## Authorisation is ownership, not a permission
 *
 * `02` §Customer permissions: *"A customer needs no permission catalogue: authorisation is
 * ownership plus state."* There is deliberately no `PROJECT_*` entry in `PERMISSIONS`.
 *
 * Every method scopes by owner **in the `where` clause**, so a project belonging to somebody
 * else does not come back and the answer is `NOT_FOUND` rather than `FORBIDDEN`. A 403 would
 * require fetching the row first and comparing — the post-fetch comparison `CLAUDE.md`
 * non-negotiable 3 bans — and it would confirm the project exists to a caller who does not
 * own it.
 *
 * The owner is a signed-in customer **or** an anonymous key (`04` §Project: exactly one is
 * set, enforced by a CHECK constraint). Both halves are real as of 4.5, and the scoping did
 * not have to change to make the second one work — which was the point of writing it to carry
 * both from the start.
 *
 * ## Claiming is one statement, and it has to be
 *
 * `04`'s constraint is `CHECK ((customerId IS NULL) <> (anonymousKey IS NULL))`. Writing
 * `customerId` first and nulling `anonymousKey` afterwards passes through a state where both
 * are set, and the constraint rejects it — not at the end, at the first statement. So
 * `claimProject` is a single `updateMany` that sets both columns at once. The integration
 * suite proves it by claiming a draft and asserting the row rather than the return value.
 *
 * ## The point is resolved when the step is saved
 *
 * Not at match time. A null `point` makes `ST_DWithin(..., NULL, ...)` return `NULL` and the
 * GiST index skip the row, so every radius service area would silently fail to match — a bug
 * whose symptom is "no results" and whose cause is invisible. `pointPrecision` records
 * whether the point came from the customer's pin or from the district centroid, because
 * `09` §Explainability has to say which.
 */

const projectRef = z.object({ projectId: z.string().min(1) })

export const createProjectSchema = z.object({
  productId: z.string().min(1),
  title: z.string().max(200).optional(),
})
export type CreateProjectInput = z.infer<typeof createProjectSchema>

export const getProjectSchema = projectRef
export type GetProjectInput = z.infer<typeof getProjectSchema>

export const patchStepSchema = z.object({
  projectId: z.string().min(1),
  step: z.string().refine(isStep, 'unknown step'),
  /** Validated a second time against the step's own schema — see `patchStep`. */
  data: z.unknown(),
})
export type PatchStepInput = z.infer<typeof patchStepSchema>

export const validateProjectSchema = projectRef
export type ValidateProjectInput = z.infer<typeof validateProjectSchema>

/**
 * The `where` fragment that makes ownership structural.
 *
 * Returns `null` when the caller has no identity at all, which every method treats as
 * `NOT_FOUND` — an actor with neither a user nor a key cannot own anything, and saying so
 * with a 404 keeps the "does this id exist" question unanswerable.
 *
 * **`userId` wins when both are present**, and both often are: `ADR-023` keeps the anonymous
 * key on the context after sign-in so that `claimProject` can move a row from one identity to
 * the other in a single request. Everywhere else, being signed in means you own rows by
 * `customerId` and the cookie addresses nothing of yours — a claimed project has had its key
 * nulled, so matching on the key would find it only if the claim had failed.
 *
 * `deletedAt: null` is spelled out even though `withSoftDelete` already injects it, because
 * that extension covers **reads only** — deliberately, so that an update aimed at a deleted
 * row surfaces as a bug rather than as a silent no-op (`shared/db`). `claimProject` moves a
 * row with `updateMany`, which is not a read, and a fragment that means one thing in a
 * `findFirst` and another in an `updateMany` is worse than a redundant key.
 */
function ownedBy(actor: ActorContext) {
  if (actor.userId !== null) return { customerId: actor.userId, deletedAt: null }
  if (actor.anonymousKey !== null && actor.anonymousKey !== '') {
    return { anonymousKey: actor.anonymousKey, deletedAt: null }
  }
  return null
}

/**
 * What a `ProjectView` needs from the database, in one place.
 *
 * `toView` is total over this shape, so a read that forgets a relation is a type error rather
 * than a view with an empty array in it — which is how "the attachments step shows nothing"
 * would otherwise reach a screen and look like a customer having uploaded nothing.
 *
 * `file` is selected rather than included whole: a `File` row carries `key` and `bucket`, and
 * a storage key is not something a customer-facing view has any use for (`14` §Access
 * control — the key encodes the access class, and handing it out invites somebody to
 * construct a URL from it instead of asking `media.fileUrl` for a signed one).
 */
const PROJECT_INCLUDE = {
  values: true,
  attachments: {
    orderBy: { sortOrder: 'asc' },
    include: { file: { select: { id: true, mime: true, sizeBytes: true, virusScanStatus: true } } },
  },
} as const

export type ProjectView = {
  projectId: string
  status: 'DRAFT' | 'READY' | 'SUBMITTED' | 'CLOSED'
  productId: string
  title: string | null
  widthMm: number | null
  depthMm: number | null
  heightMm: number | null
  /** Derived; there is no input that writes it (`10` §Field specifics). */
  areaM2: number | null
  quantity: number
  projectType: string | null
  installationType: string | null
  cityId: string | null
  districtId: string | null
  addressNote: string | null
  pointPrecision: 'EXACT' | 'DISTRICT' | 'CITY' | null
  timing: string | null
  note: string | null
  values: {
    attributeId: string
    optionId: string | null
    numberValue: number | null
    boolValue: boolean | null
    textValue: string | null
  }[]
  /** Task 4.6. `PHOTO` and `DOCUMENT` both — `10` §Field specifics, `14` §Limits. */
  attachments: {
    attachmentId: string
    fileId: string
    kind: 'PHOTO' | 'DOCUMENT'
    mime: string
    sizeBytes: number
    /** `14` §Virus scanning: nothing is served to anyone but the uploader until `CLEAN`. */
    virusScanStatus: 'PENDING' | 'CLEAN' | 'INFECTED' | 'FAILED'
    sortOrder: number
  }[]
}

export const createProject = serviceMethod<CreateProjectInput, { projectId: string }>(
  'project',
  'createProject',
  {
    kind: 'customer-owned',
    describe: 'the new row is stamped with the caller’s own identity; nothing is looked up',
    scopedBy: ['userId', 'anonymousKey'],
  },
  async (actor, input) => {
    /*
     * Task 4.5: an anonymous visitor may create a draft. `10` §Anonymous drafts puts the
     * account wall between *configure* and *get offers*, and `ADR-021` already put this route
     * on a public path — so the only thing left was to let the row exist without a customer.
     *
     * The owner is exactly one of the two, which is what `04`'s
     * `CHECK ((customerId IS NULL) <> (anonymousKey IS NULL))` says. Building the `data`
     * fragment as one object rather than as two conditional assignments keeps that true by
     * construction: there is no intermediate value with both set and none with neither.
     */
    const owner: { customerId: string } | { anonymousKey: string } | null =
      actor.userId !== null
        ? { customerId: actor.userId }
        : actor.anonymousKey !== null && actor.anonymousKey !== ''
          ? { anonymousKey: actor.anonymousKey }
          : null

    if (owner === null) {
      /*
       * No user and no key. The transport mints a key before calling this — see
       * `app/actions/project.ts` — so reaching here means the browser refused the cookie or
       * the caller is a script. The CHECK constraint would reject the row anyway; saying so
       * in words is a better error than a database violation, and `10` §Anonymous drafts is
       * the reason a cookie is a hard requirement rather than a nicety.
       */
      return err(precondition('a draft needs either a signed-in customer or a draft cookie'))
    }

    /*
     * *"A key claims at most 3 drafts"* — `10` §Anonymous drafts, counted in **rows**.
     *
     * Counted rather than tracked in the cookie, because the cookie is attacker-controlled
     * and a client-side counter is a suggestion. `04`'s XOR constraint is what makes this
     * count well-defined at all: a project has exactly one owner, so "drafts held by this
     * key" is a `WHERE` clause rather than a judgement.
     *
     * There is no equivalent ceiling for a signed-in customer. The limit exists because this
     * is an **unauthenticated write endpoint**, not because three projects is a sensible
     * number of projects to have.
     */
    if ('anonymousKey' in owner) {
      const held = await prisma.project.count({ where: { anonymousKey: owner.anonymousKey } })

      if (held >= MAX_ANONYMOUS_DRAFTS_PER_KEY) {
        return err(
          conflict(
            `an unclaimed browser may hold ${MAX_ANONYMOUS_DRAFTS_PER_KEY} drafts; sign in to keep more`,
          ),
        )
      }
    }

    const product = await prisma.product.findFirst({
      where: { id: input.productId, isActive: true },
      select: { id: true },
    })
    if (product === null) return err(notFound('Product'))

    const project = await prisma.project.create({
      data: {
        ...owner,
        productId: input.productId,
        title: input.title ?? null,
        status: 'DRAFT',
      },
      select: { id: true },
    })

    return ok({ projectId: project.id })
  },
)

export const getProject = serviceMethod<GetProjectInput, ProjectView>(
  'project',
  'getProject',
  {
    kind: 'customer-owned',
    describe: 'the Project row, scoped by customerId or anonymousKey in the where clause',
    scopedBy: ['userId', 'anonymousKey'],
  },
  async (actor, input) => {
    const owner = ownedBy(actor)
    if (owner === null) return err(notFound('Project'))

    const project = await prisma.project.findFirst({
      where: { id: input.projectId, ...owner },
      include: PROJECT_INCLUDE,
    })
    if (project === null) return err(notFound('Project'))

    return ok(toView(project))
  },
)

/**
 * One step, written immediately — `10` §Step structure, task 4.2.
 *
 * State lives in the database, not in a client store (`07` §Forms), which is what makes the
 * gate's "close the browser and come back" half true. "Save draft" is therefore already true
 * at all times; the button exists to reassure and to exit, and it calls nothing new.
 */
export const patchStep = serviceMethod<PatchStepInput, ProjectView>(
  'project',
  'patchStep',
  {
    kind: 'customer-owned',
    describe: 'the Project row, scoped by customerId or anonymousKey in the where clause',
    scopedBy: ['userId', 'anonymousKey'],
  },
  async (actor, input) => {
    const owner = ownedBy(actor)
    if (owner === null) return err(notFound('Project'))

    const existing = await prisma.project.findFirst({
      where: { id: input.projectId, ...owner },
      select: { id: true, status: true, widthMm: true, depthMm: true },
    })
    if (existing === null) return err(notFound('Project'))

    // One definition of "may not be touched", in `domain/status.ts`.
    if (!canEdit(existing.status as ProjectStatus)) {
      return err(precondition(`a ${existing.status} project cannot be edited`))
    }

    const step = input.step as Step

    /*
     * The step's own schema — the **same object** the client validated with on blur
     * (`10` §Validation). A second server-side copy of these rules is a second place for them
     * to be wrong.
     */
    const parsed = STEP_SCHEMAS[step].safeParse(input.data ?? {})
    if (!parsed.success) {
      const { validation } = await import('@/shared/result')
      return err(validation(parsed.error.issues))
    }

    const data = parsed.data as Record<string, unknown>
    const update: Record<string, unknown> = {}

    for (const key of [
      'productId',
      'widthMm',
      'depthMm',
      'heightMm',
      'quantity',
      'projectType',
      'installationType',
      'cityId',
      'districtId',
      'addressNote',
      'timing',
      'budgetHintKurus',
      'note',
    ]) {
      if (key in data) update[key] = data[key]
    }

    // `areaM2` is derived, never accepted. No step schema has a field for it, and this is the
    // only place it is written.
    if (step === 'dimensions') {
      const widthMm = (update.widthMm as number | null | undefined) ?? existing.widthMm
      const depthMm = (update.depthMm as number | null | undefined) ?? existing.depthMm
      update.areaM2 = deriveAreaM2(widthMm ?? null, depthMm ?? null)
    }

    // Not a literal: the transition lives beside the terminal-state definition it depends on.
    if (Object.keys(update).length > 0) {
      update.status = statusAfterEdit(existing.status as ProjectStatus)
    }

    await prisma.project.update({ where: { id: existing.id }, data: update })

    if (step === 'location') {
      await resolvePoint(existing.id, data)
    }

    const refreshed = await prisma.project.findFirst({
      where: { id: existing.id, ...owner },
      include: PROJECT_INCLUDE,
    })
    if (refreshed === null) return err(notFound('Project'))

    if (step === 'options' && Array.isArray(data.values)) {
      await writeValues(existing.id, data.values as ValueInput[])
      const withValues = await prisma.project.findFirst({
        where: { id: existing.id, ...owner },
        include: PROJECT_INCLUDE,
      })
      if (withValues !== null) return ok(toView(withValues))
    }

    return ok(toView(refreshed))
  },
)

type ValueInput = {
  attributeId: string
  optionId?: string | null
  numberValue?: number | null
  boolValue?: boolean | null
  textValue?: string | null
}

/** Replace the answers wholesale: the options step submits the complete set it is showing. */
async function writeValues(projectId: string, values: ValueInput[]): Promise<void> {
  const attributeIds = [...new Set(values.map((value) => value.attributeId))]

  await prisma.$transaction(async (tx) => {
    await tx.projectAttributeValue.deleteMany({
      where: { projectId, attributeId: { in: attributeIds } },
    })

    if (values.length > 0) {
      await tx.projectAttributeValue.createMany({
        data: values.map((value) => ({
          projectId,
          attributeId: value.attributeId,
          optionId: value.optionId ?? null,
          numberValue: value.numberValue ?? null,
          boolValue: value.boolValue ?? null,
          textValue: value.textValue ?? null,
        })),
      })
    }
  })
}

/**
 * Fill `point` and `pointPrecision` — the decision `04` §Project records.
 *
 * A pin from the customer wins and is `EXACT`. Otherwise the district centroid, then the city
 * centroid; both are seeded, so the fall-through to `null` means the pair genuinely does not
 * resolve rather than that the customer skipped the map.
 */
async function resolvePoint(projectId: string, data: Record<string, unknown>): Promise<void> {
  const { setPoint, getPoint } = await import('@/shared/geo')

  const latitude = data.latitude as number | null | undefined
  const longitude = data.longitude as number | null | undefined

  if (
    latitude !== null &&
    latitude !== undefined &&
    longitude !== null &&
    longitude !== undefined
  ) {
    await setPoint('Project', projectId, { latitude, longitude })
    await prisma.project.update({ where: { id: projectId }, data: { pointPrecision: 'EXACT' } })
    return
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { cityId: true, districtId: true },
  })
  if (project === null) return

  if (project.districtId !== null) {
    const point = await getPoint('District', project.districtId)
    if (point !== null) {
      await setPoint('Project', projectId, point)
      await prisma.project.update({
        where: { id: projectId },
        data: { pointPrecision: 'DISTRICT' },
      })
      return
    }
  }

  if (project.cityId !== null) {
    const point = await getPoint('City', project.cityId)
    if (point !== null) {
      await setPoint('Project', projectId, point)
      await prisma.project.update({ where: { id: projectId }, data: { pointPrecision: 'CITY' } })
      return
    }
  }

  // Neither resolved: leave both null so `checkReadiness` reports `location-unresolvable`.
  await prisma.project.update({ where: { id: projectId }, data: { pointPrecision: null } })
}

export type ValidateResult = ReadinessResult & { status: string }

/**
 * `POST /projects/{id}/validate` — task 4.7.
 *
 * Promotes `DRAFT` → `READY` when every rule passes, and returns the issues with their steps
 * when they do not. Only a `READY` project can request offers; the request itself is Phase 6,
 * and this is the gate it will check.
 */
export const validateProject = serviceMethod<ValidateProjectInput, ValidateResult>(
  'project',
  'validateProject',
  {
    kind: 'customer-owned',
    describe: 'the Project row, scoped by customerId or anonymousKey in the where clause',
    scopedBy: ['userId', 'anonymousKey'],
  },
  async (actor, input) => {
    const owner = ownedBy(actor)
    if (owner === null) return err(notFound('Project'))

    const project = await prisma.project.findFirst({
      where: { id: input.projectId, ...owner },
      include: { values: true, product: { include: { attributes: true } } },
    })
    if (project === null) return err(notFound('Project'))

    const customer =
      project.customerId === null
        ? null
        : await prisma.user.findUnique({
            where: { id: project.customerId },
            select: { emailVerifiedAt: true },
          })

    const answers: Record<string, string | null> = {}
    for (const value of project.values) {
      const attribute = project.product.attributes.find((row) => row.id === value.attributeId)
      if (attribute === undefined) continue
      answers[attribute.key] =
        value.optionId ??
        (value.boolValue === null ? null : String(value.boolValue)) ??
        value.textValue ??
        null
    }

    const { maxAreaM2 } = await platformLimits()

    const result = checkReadiness({
      project: {
        productId: project.productId,
        widthMm: project.widthMm,
        depthMm: project.depthMm,
        heightMm: project.heightMm,
        areaM2: project.areaM2,
        projectType: project.projectType,
        installationType: project.installationType,
        cityId: project.cityId,
        districtId: project.districtId,
        pointPrecision: project.pointPrecision,
      },
      attributes: project.product.attributes.map((attribute) => ({
        id: attribute.id,
        key: attribute.key,
        isRequired: attribute.isRequired,
        min: attribute.min,
        max: attribute.max,
        showIfAttributeKey: attribute.showIfAttributeKey,
        showIfValue: attribute.showIfValue,
      })),
      answers,
      answeredAttributeIds: new Set(project.values.map((value) => value.attributeId)),
      // An anonymous draft has no account to verify, so the rule cannot apply yet; 4.5's
      // claim flow is what attaches an account, and offers cannot be requested before that.
      customer: { emailVerified: customer?.emailVerifiedAt != null || project.customerId === null },
      maxAreaM2,
    })

    /*
     * Terminal states are returned unchanged by `statusAfterValidation`, so a `SUBMITTED`
     * project is neither rewritten nor misreported and a `CLOSED` one is not resurrected.
     *
     * The returned status is the **persisted** one, not the computed one. Reporting what the
     * check would have produced, while the database holds something else, is a lie Phase 6
     * would read out of this field.
     */
    const current = project.status as ProjectStatus
    const nextStatus = statusAfterValidation(current, result.ready)

    if (nextStatus !== current) {
      await prisma.project.update({ where: { id: project.id }, data: { status: nextStatus } })
    }

    return ok({ ...result, status: nextStatus })
  },
)

/** The platform maximum area. A setting rather than a constant, per `ADM-06`. */
async function platformLimits(): Promise<{ maxAreaM2: number }> {
  const row = await prisma.platformSetting.findUnique({ where: { key: 'project.max_area_m2' } })
  const value = row?.value
  return { maxAreaM2: typeof value === 'number' && Number.isFinite(value) ? value : 500 }
}

type ProjectRow = {
  id: string
  status: string
  productId: string
  title: string | null
  widthMm: number | null
  depthMm: number | null
  heightMm: number | null
  areaM2: number | null
  quantity: number
  projectType: string | null
  installationType: string | null
  cityId: string | null
  districtId: string | null
  addressNote: string | null
  pointPrecision: string | null
  timing: string | null
  note: string | null
  values: {
    attributeId: string
    optionId: string | null
    numberValue: number | null
    boolValue: boolean | null
    textValue: string | null
  }[]
  attachments: {
    id: string
    fileId: string
    kind: string
    sortOrder: number
    file: { id: string; mime: string; sizeBytes: number; virusScanStatus: string }
  }[]
}

function toView(project: ProjectRow): ProjectView {
  return {
    projectId: project.id,
    status: project.status as ProjectView['status'],
    productId: project.productId,
    title: project.title,
    widthMm: project.widthMm,
    depthMm: project.depthMm,
    heightMm: project.heightMm,
    areaM2: project.areaM2,
    quantity: project.quantity,
    projectType: project.projectType,
    installationType: project.installationType,
    cityId: project.cityId,
    districtId: project.districtId,
    addressNote: project.addressNote,
    pointPrecision: project.pointPrecision as ProjectView['pointPrecision'],
    timing: project.timing,
    note: project.note,
    values: project.values.map((value) => ({
      attributeId: value.attributeId,
      optionId: value.optionId,
      numberValue: value.numberValue,
      boolValue: value.boolValue,
      textValue: value.textValue,
    })),
    attachments: project.attachments.map((attachment) => ({
      attachmentId: attachment.id,
      fileId: attachment.fileId,
      kind: attachment.kind as 'PHOTO' | 'DOCUMENT',
      mime: attachment.file.mime,
      sizeBytes: attachment.file.sizeBytes,
      virusScanStatus: attachment.file
        .virusScanStatus as ProjectView['attachments'][number]['virusScanStatus'],
      sortOrder: attachment.sortOrder,
    })),
  }
}

/* -------------------------------------------------------------------------- */
/* 4.5 · claiming an anonymous draft                                           */
/* -------------------------------------------------------------------------- */

export const claimProjectSchema = projectRef
export type ClaimProjectInput = z.infer<typeof claimProjectSchema>

export type ClaimResult = {
  projectId: string
  /** `false` when the project was already this customer's — see the idempotency note. */
  claimed: boolean
}

/**
 * `POST /projects/{id}/claim` — task 4.5, `10` §Anonymous drafts.
 *
 * Moves one draft from the cookie that created it to the account that just signed in. This
 * is the riskiest task in the phase (`26` §Phase 4) because it is where sessions, cookies,
 * retention and ownership checks intersect, and it is the one flow a customer meets *before*
 * they have any reason to trust the product.
 *
 * ## Three properties, and the `where` clause carries all three
 *
 * ```
 * where: { id, anonymousKey: key, customerId: null, deletedAt: null }
 * data:  { customerId: actor.userId, anonymousKey: null }
 * ```
 *
 * **The cookie must still match.** `anonymousKey: key` is the whole authorisation. Without
 * it, `POST /projects/{someone-elses-id}/claim` from any signed-in account would work, and
 * the ids are the only thing standing between a customer's dimensions, address note and site
 * photos and anybody who can iterate. `10` says *"claiming requires the cookie to still
 * match"* and this is the line that means it.
 *
 * **It is one statement.** `04`'s `CHECK ((customerId IS NULL) <> (anonymousKey IS NULL))`
 * rejects the intermediate state where both columns are set, so writing the customer first
 * and clearing the key second fails at the *first* statement — not at commit, which is what
 * makes it look like a constraint bug rather than an ordering bug. A single `UPDATE` never
 * has an intermediate state to reject.
 *
 * **An already-claimed draft is not an error.** A customer who double-submits, or whose
 * browser retried the request, must not be told their own project does not exist. The second
 * call reports `claimed: false` and succeeds — but only after re-establishing ownership
 * through the same `where`-clause discipline, so "already mine" is proven rather than
 * assumed.
 *
 * ## What it does not do
 *
 * It does not clear the cookie. The key may address two more drafts (`10` allows three), and
 * deleting it here would strand them — reachable by nobody, deleted by nothing until the
 * Phase 9 sweep. The transport keeps the cookie; the row loses the key.
 */
export const claimProject = serviceMethod<ClaimProjectInput, ClaimResult>(
  'project',
  'claimProject',
  {
    kind: 'customer-owned',
    describe:
      'the draft is matched by id AND by the caller’s own anonymous cookie key, in the where clause',
    scopedBy: ['userId', 'anonymousKey'],
  },
  async (actor, input) => {
    if (actor.userId === null) {
      return err(precondition('sign in before claiming a draft'))
    }

    const key = actor.anonymousKey

    /*
     * No cookie means nothing to claim. `NOT_FOUND` rather than a more descriptive error, on
     * purpose: the alternative distinguishes "this id exists but your cookie is wrong" from
     * "no such id", and that difference is exactly what an enumeration attack is looking for.
     */
    if (key === null || key === '') {
      return err(notFound('Project'))
    }

    const moved = await prisma.project.updateMany({
      where: {
        id: input.projectId,
        anonymousKey: key,
        customerId: null,
        // `withSoftDelete` covers reads only; an `updateMany` needs this spelled out.
        deletedAt: null,
      },
      data: { customerId: actor.userId, anonymousKey: null },
    })

    if (moved.count === 0) {
      const mine = await prisma.project.findFirst({
        where: { id: input.projectId, customerId: actor.userId },
        select: { id: true },
      })

      if (mine !== null) return ok({ projectId: mine.id, claimed: false })

      return err(notFound('Project'))
    }

    /*
     * The only place in the product where a row's **owner** changes, and the one change that
     * destroys its own evidence: a successful claim nulls the key that connected the draft to
     * the visitor who created it. Best-effort, like every `recordAudit` — `19` §Audit keeps
     * the mandatory entries inside their caller's transaction, and this is not one of those.
     */
    const { recordAudit } = await import('@/modules/audit/infrastructure/audit-log')
    await recordAudit(actor, {
      action: 'project_claimed',
      entityType: 'Project',
      entityId: input.projectId,
      after: { customerId: actor.userId },
      reason: 'anonymous draft claimed on sign-in',
    })

    return ok({ projectId: input.projectId, claimed: true })
  },
)

/* -------------------------------------------------------------------------- */
/* 4.8 · the customer's own list                                               */
/* -------------------------------------------------------------------------- */

export const listProjectsSchema = z.object({})
export type ListProjectsInput = z.infer<typeof listProjectsSchema>

export type ProjectSummary = {
  projectId: string
  status: 'DRAFT' | 'READY' | 'SUBMITTED' | 'CLOSED'
  productId: string
  title: string | null
  areaM2: number | null
  cityId: string | null
  attachmentCount: number
  updatedAt: string
}

export type ListProjectsResult = { projects: ProjectSummary[] }

/**
 * The customer dashboard's list — task 4.8, `customer_dashboard_final` and `_empty_state`.
 *
 * Scoped by `ownedBy`, which means **an anonymous visitor gets a list too**: the drafts held
 * by their cookie. That is not scope creep, it is the same `where` clause every other method
 * here uses, and refusing it would have meant a second ownership rule that says "except for
 * lists". `/hesap` is auth-gated (`ADR-024`), so the screen a visitor sees is the sign-in
 * page — but `/proje/[id]` is not, and a visitor with three drafts and no way to enumerate
 * them has to keep three URLs in their history.
 *
 * `updatedAt` is serialised as an ISO string rather than passed as a `Date`. A server action's
 * return value crosses a serialisation boundary, and `07` §Forms puts formatting in the
 * component with the locale — `Europe/Istanbul` for display, UTC in the database
 * (`CLAUDE.md` §Conventions).
 */
export const listProjects = serviceMethod<ListProjectsInput, ListProjectsResult>(
  'project',
  'listProjects',
  {
    kind: 'customer-owned',
    describe: 'every Project row scoped by customerId or anonymousKey in the where clause',
    scopedBy: ['userId', 'anonymousKey'],
  },
  async (actor) => {
    const owner = ownedBy(actor)

    // Not an error and not an empty-list-shaped lie: a caller with no identity owns nothing,
    // and the dashboard renders its empty state from exactly this.
    if (owner === null) return ok({ projects: [] })

    const projects = await prisma.project.findMany({
      where: owner,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        status: true,
        productId: true,
        title: true,
        areaM2: true,
        cityId: true,
        updatedAt: true,
        _count: { select: { attachments: true } },
      },
    })

    return ok({
      projects: projects.map((project) => ({
        projectId: project.id,
        status: project.status as ProjectSummary['status'],
        productId: project.productId,
        title: project.title,
        areaM2: project.areaM2,
        cityId: project.cityId,
        attachmentCount: project._count.attachments,
        updatedAt: project.updatedAt.toISOString(),
      })),
    })
  },
)

/* -------------------------------------------------------------------------- */
/* 4.9 · duplicate                                                             */
/* -------------------------------------------------------------------------- */

export const duplicateProjectSchema = projectRef
export type DuplicateProjectInput = z.infer<typeof duplicateProjectSchema>

/**
 * "Duplicate project" — task 4.9, `10` §Reuse: *"copies everything except attachments and
 * status"*.
 *
 * The customer comparing two sizes of the same pergola should not retype ten steps. Both
 * exclusions are deliberate and neither is an oversight:
 *
 *   **Attachments are not copied.** A `ProjectAttachment` points at a `File` whose storage key
 *   embeds the *owning project's* id (`14` §Access control, `storageKey`). Copying the row
 *   would give two projects one object, so deleting either would break the other, and the
 *   semi-private read rule — visible to manufacturers whose request on *that* project was
 *   accepted — would be answering for two projects at once. Copying the object instead is a
 *   storage decision nobody has made; `10` says not to, and `10` is right.
 *
 *   **Status is not copied.** A duplicate is a `DRAFT` even when its source was `READY`,
 *   because readiness was established against the old values and the customer is duplicating
 *   precisely in order to change some. `status.ts` owns that rule and `statusAfterEdit` says
 *   the same thing for the same reason.
 *
 * The point is re-resolved rather than copied, so `pointPrecision` stays honest: it describes
 * how *this* row's location was determined, and the copy determines it the same way from the
 * same city and district.
 */
export const duplicateProject = serviceMethod<DuplicateProjectInput, { projectId: string }>(
  'project',
  'duplicateProject',
  {
    kind: 'customer-owned',
    describe: 'the source Project row, scoped by customerId or anonymousKey in the where clause',
    scopedBy: ['userId', 'anonymousKey'],
  },
  async (actor, input) => {
    const owner = ownedBy(actor)
    if (owner === null) return err(notFound('Project'))

    const source = await prisma.project.findFirst({
      where: { id: input.projectId, ...owner },
      include: { values: true },
    })
    if (source === null) return err(notFound('Project'))

    /*
     * The ceiling applies to the copy as much as to the original — `10` §Anonymous drafts
     * caps the *key*, not the endpoint. Without this, "duplicate" is an unauthenticated way
     * past a limit the create path enforces.
     */
    if (actor.userId === null && actor.anonymousKey !== null) {
      const held = await prisma.project.count({ where: { anonymousKey: actor.anonymousKey } })

      if (held >= MAX_ANONYMOUS_DRAFTS_PER_KEY) {
        return err(
          conflict(
            `an unclaimed browser may hold ${MAX_ANONYMOUS_DRAFTS_PER_KEY} drafts; sign in to keep more`,
          ),
        )
      }
    }

    const copy = await prisma.project.create({
      data: {
        // The caller's identity, not the source's: `ownedBy` has already proved they are the
        // same, and reading it from the actor keeps the XOR fragment in one shape.
        ...(actor.userId !== null
          ? { customerId: actor.userId }
          : { anonymousKey: actor.anonymousKey as string }),
        productId: source.productId,
        title: source.title,
        widthMm: source.widthMm,
        depthMm: source.depthMm,
        heightMm: source.heightMm,
        areaM2: source.areaM2,
        quantity: source.quantity,
        projectType: source.projectType,
        installationType: source.installationType,
        cityId: source.cityId,
        districtId: source.districtId,
        addressNote: source.addressNote,
        timing: source.timing,
        budgetHintKurus: source.budgetHintKurus,
        note: source.note,
        // Not copied: status (always DRAFT) and attachments (see above).
        status: 'DRAFT',
        values: {
          create: source.values.map((value) => ({
            attributeId: value.attributeId,
            optionId: value.optionId,
            numberValue: value.numberValue,
            boolValue: value.boolValue,
            textValue: value.textValue,
          })),
        },
      },
      select: { id: true },
    })

    // Re-resolved rather than copied, so `pointPrecision` describes this row's own resolution.
    await resolvePoint(copy.id, {})

    return ok({ projectId: copy.id })
  },
)

/* -------------------------------------------------------------------------- */
/* 4.6 · attachments                                                           */
/* -------------------------------------------------------------------------- */

export const addAttachmentSchema = z.object({
  projectId: z.string().min(1),
  fileId: z.string().min(1),
})
export type AddAttachmentInput = z.infer<typeof addAttachmentSchema>

export const removeAttachmentSchema = z.object({
  projectId: z.string().min(1),
  attachmentId: z.string().min(1),
})
export type RemoveAttachmentInput = z.infer<typeof removeAttachmentSchema>

/**
 * `PHOTO` **and** `DOCUMENT` — task 4.6.
 *
 * `project_summary_step_10` shows `site_plan_v2.pdf` beside the photos, which is why
 * `AttachmentKind` has two values and why the kind is **derived from the file's MIME type**
 * rather than asked for. A client-declared kind is a client-declared kind: a PDF labelled
 * `PHOTO` would go through the image pipeline, and `14` §Limits is explicit that MIME comes
 * from file content and not from what the caller said.
 *
 * The bytes never pass through here. `14` §Upload flow is presign → PUT straight to storage →
 * complete, and this links an already-uploaded `File` to the project. Two guards make that
 * link safe:
 *
 *   the file must be owned by **this project** (`ownerType: 'PROJECT', ownerId: projectId`),
 *   so a caller cannot attach a company document or another customer's photo by id; and
 *
 *   the project must be owned by **this caller**, through the same `where` clause as
 *   everything else here.
 *
 * The count ceiling is `14` §Limits' ten, read from `UPLOAD_POLICY` rather than repeated, and
 * checked here as well as at presign: presign counts `File` rows, this counts links, and a
 * file that was uploaded but never linked should not consume a customer's tenth slot forever.
 */
export const addAttachment = serviceMethod<AddAttachmentInput, ProjectView>(
  'project',
  'addAttachment',
  {
    kind: 'customer-owned',
    describe: 'the Project row, scoped by customerId or anonymousKey in the where clause',
    scopedBy: ['userId', 'anonymousKey'],
  },
  async (actor, input) => {
    const owner = ownedBy(actor)
    if (owner === null) return err(notFound('Project'))

    const project = await prisma.project.findFirst({
      where: { id: input.projectId, ...owner },
      select: { id: true, status: true },
    })
    if (project === null) return err(notFound('Project'))

    if (!canEdit(project.status as ProjectStatus)) {
      return err(precondition(`a ${project.status} project cannot be edited`))
    }

    /*
     * `ownerId` is the project, so this is ownership and not a lookup by convention. A file
     * uploaded against another project — or against a company document — simply does not
     * match, and the answer is `NOT_FOUND` for the same reason it is everywhere else here.
     */
    const file = await prisma.file.findFirst({
      where: { id: input.fileId, ownerType: 'PROJECT', ownerId: project.id },
      select: { id: true, mime: true },
    })
    if (file === null) return err(notFound('File'))

    const { UPLOAD_POLICY } = await import('@/modules/media/domain/upload-policy')
    const existing = await prisma.projectAttachment.count({ where: { projectId: project.id } })

    if (existing >= UPLOAD_POLICY.PROJECT.maxCount) {
      return err(conflict(`a project may hold ${UPLOAD_POLICY.PROJECT.maxCount} attachments`))
    }

    await prisma.projectAttachment.upsert({
      where: { projectId_fileId: { projectId: project.id, fileId: file.id } },
      // Idempotent: the uploader retrying `complete` must not produce a second row, and the
      // unique constraint would otherwise turn a retry into a 409 the customer cannot act on.
      update: {},
      create: {
        projectId: project.id,
        fileId: file.id,
        kind: attachmentKindFor(file.mime),
        sortOrder: existing,
      },
    })

    const refreshed = await prisma.project.findFirst({
      where: { id: project.id, ...owner },
      include: PROJECT_INCLUDE,
    })
    if (refreshed === null) return err(notFound('Project'))

    return ok(toView(refreshed))
  },
)

/**
 * Unlink an attachment.
 *
 * The `ProjectAttachment` row goes; the `File` row and its object do **not**. `14` §Retention
 * is explicit — *"storage objects are never deleted without a corresponding `File` row
 * transition"* — and that is what makes the orphan sweep safe to run. Deleting the object
 * here would leave a `File` row pointing at nothing, which is the one state the sweep cannot
 * tell apart from a file it should keep.
 */
export const removeAttachment = serviceMethod<RemoveAttachmentInput, ProjectView>(
  'project',
  'removeAttachment',
  {
    kind: 'customer-owned',
    describe: 'the Project row, scoped by customerId or anonymousKey in the where clause',
    scopedBy: ['userId', 'anonymousKey'],
  },
  async (actor, input) => {
    const owner = ownedBy(actor)
    if (owner === null) return err(notFound('Project'))

    const project = await prisma.project.findFirst({
      where: { id: input.projectId, ...owner },
      select: { id: true, status: true },
    })
    if (project === null) return err(notFound('Project'))

    if (!canEdit(project.status as ProjectStatus)) {
      return err(precondition(`a ${project.status} project cannot be edited`))
    }

    // Scoped by project as well as by id, so an attachment id from another project is a
    // no-op rather than a cross-project delete.
    await prisma.projectAttachment.deleteMany({
      where: { id: input.attachmentId, projectId: project.id },
    })

    const refreshed = await prisma.project.findFirst({
      where: { id: project.id, ...owner },
      include: PROJECT_INCLUDE,
    })
    if (refreshed === null) return err(notFound('Project'))

    return ok(toView(refreshed))
  },
)

/**
 * `PHOTO` or `DOCUMENT`, from the MIME type the upload pipeline determined from the bytes.
 *
 * Anything that is not an image is a document, rather than the other way round: `14` §Limits
 * lists exactly one non-image type for a project attachment (`application/pdf`), and a
 * default of `PHOTO` would send a future accepted type through the image pipeline.
 */
function attachmentKindFor(mime: string): 'PHOTO' | 'DOCUMENT' {
  return mime.startsWith('image/') ? 'PHOTO' : 'DOCUMENT'
}

export const projectService = {
  createProject,
  getProject,
  patchStep,
  validateProject,
  claimProject,
  listProjects,
  duplicateProject,
  addAttachment,
  removeAttachment,
} satisfies Record<string, { meta: unknown }>
