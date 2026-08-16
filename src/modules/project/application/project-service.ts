import 'server-only'

import { z } from 'zod'

import { prisma } from '@/shared/db'
import { err, notFound, ok, precondition } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'
import type { ActorContext } from '@/shared/context/actor'

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
 * set, enforced by a CHECK constraint). Anonymous drafts are 4.5, in the second half, but the
 * scoping is built to carry both now: retrofitting an identity into every `where` clause is
 * exactly the kind of change that misses one.
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
 */
function ownedBy(actor: ActorContext, anonymousKey?: string | null) {
  if (actor.userId !== null) return { customerId: actor.userId }
  if (anonymousKey !== null && anonymousKey !== undefined && anonymousKey !== '') {
    return { anonymousKey }
  }
  return null
}

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
    // Anonymous creation is 4.5. Until then the CHECK constraint would reject a row with
    // neither owner, so refusing here gives a better error than a database violation.
    if (actor.userId === null) {
      return err(precondition('sign in to start a project'))
    }

    const product = await prisma.product.findFirst({
      where: { id: input.productId, isActive: true },
      select: { id: true },
    })
    if (product === null) return err(notFound('Product'))

    const project = await prisma.project.create({
      data: {
        customerId: actor.userId,
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
      include: { values: true },
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
      include: { values: true },
    })
    if (refreshed === null) return err(notFound('Project'))

    if (step === 'options' && Array.isArray(data.values)) {
      await writeValues(existing.id, data.values as ValueInput[])
      const withValues = await prisma.project.findFirst({
        where: { id: existing.id, ...owner },
        include: { values: true },
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
  }
}

export const projectService = {
  createProject,
  getProject,
  patchStep,
  validateProject,
} satisfies Record<string, { meta: unknown }>
