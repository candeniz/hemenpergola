import { beforeAll, describe, expect, it } from 'vitest'

import { getConfigurableProduct } from '@/modules/catalog/application/catalog-service'
import {
  createProject,
  getProject,
  patchStep,
  validateProject,
} from '@/modules/project/application/project-service'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'
import { getPoint } from '@/shared/geo'

import { getPrisma } from './setup'

/**
 * The configurator against a real database — tasks 4.1 to 4.4 and 4.7.
 *
 * Four things here cannot be written against a fake, which is why they are integration tests:
 * the PostGIS point the service resolves at save time, the soft-delete extension, the
 * ownership scoping that makes a foreign project a 404, and the three-sided option visibility
 * that depends on rows changing under a draft.
 */

let productId = ''
let attributeId = ''
let requiredAttributeId = ''
let optionA = ''
let optionB = ''
let cityId = ''
let districtId = ''

const DISTRICT_POINT = { latitude: 40.7654, longitude: 29.9408 }
const PIN = { latitude: 41.0082, longitude: 28.9784 }

async function customer(id: string, verified = true): Promise<ActorContext> {
  await getPrisma().user.upsert({
    where: { id },
    create: {
      id,
      email: `${id}@example.com`,
      emailVerifiedAt: verified ? new Date() : null,
    },
    update: { emailVerifiedAt: verified ? new Date() : null },
  })

  return anonymousActor({ userId: id, globalRole: 'CUSTOMER', ip: '203.0.113.90' })
}

beforeAll(async () => {
  const category = await getPrisma().category.create({ data: { sortOrder: 1 } })
  const product = await getPrisma().product.create({
    data: { categoryId: category.id, basisType: 'AREA_M2' },
  })
  productId = product.id

  const attribute = await getPrisma().productAttribute.create({
    data: { productId, key: 'roof', inputType: 'SELECT', affectsPrice: true },
  })
  attributeId = attribute.id

  const required = await getPrisma().productAttribute.create({
    data: { productId, key: 'colour', inputType: 'SELECT', isRequired: true },
  })
  requiredAttributeId = required.id

  const a = await getPrisma().productOption.create({
    data: { attributeId, value: 'louvered', isActive: true },
  })
  optionA = a.id

  const b = await getPrisma().productOption.create({
    data: { attributeId, value: 'fixed', isActive: true },
  })
  optionB = b.id

  await getPrisma().productOption.create({
    data: { attributeId: requiredAttributeId, value: 'anthracite', isActive: true },
  })

  const city = await getPrisma().city.create({ data: { name: 'Kocaeli', plateCode: 951 } })
  cityId = city.id

  const district = await getPrisma().district.create({ data: { cityId, name: 'İzmit' } })
  districtId = district.id

  const { setPoint } = await import('@/shared/geo')
  await setPoint('District', districtId, DISTRICT_POINT)
}, 120_000)

async function draftFor(actor: ActorContext): Promise<string> {
  const created = await createProject(actor, { productId })
  if (!created.ok) throw new Error('could not create a draft')
  return created.value.projectId
}

describe('ownership', () => {
  it('answers NOT_FOUND for another customer’s project, never FORBIDDEN', async () => {
    /*
     * `12` §Authorization rule 2 and `CLAUDE.md` non-negotiable 3. Ownership is in the `where`
     * clause, so the row does not come back. A 403 would require fetching it first and
     * comparing — and would confirm to a stranger that the project exists.
     */
    const mine = await customer('usr_owner_a')
    const theirs = await customer('usr_owner_b')

    const projectId = await draftFor(mine)

    const read = await getProject(theirs, { projectId })
    expect(read.ok).toBe(false)
    if (read.ok) return
    expect(read.error.kind).toBe('NOT_FOUND')

    const write = await patchStep(theirs, {
      projectId,
      step: 'dimensions',
      data: { widthMm: 4000 },
    })
    expect(write.ok).toBe(false)
    if (write.ok) return
    expect(write.error.kind).toBe('NOT_FOUND')
  }, 120_000)
})

describe('soft delete', () => {
  it('drops a deleted project out of default reads, and keeps it for the unfiltered client', async () => {
    // `Project` has been in `SOFT_DELETE_MODELS` since Phase 0; this is the first phase where
    // the table exists to prove it against.
    const actor = await customer('usr_softdelete')
    const projectId = await draftFor(actor)

    await getPrisma().project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    })

    const read = await getProject(actor, { projectId })
    expect(read.ok, 'a soft-deleted project must not come back').toBe(false)

    const { prismaUnfiltered } = await import('@/shared/db')
    const raw = await prismaUnfiltered.project.findUnique({ where: { id: projectId } })
    expect(raw?.id, 'the row is still there — deletion is a flag, not a DELETE').toBe(projectId)
  }, 120_000)
})

describe('dimensions', () => {
  it('derives the area and refuses to let the customer write one', async () => {
    /*
     * `10` §Field specifics: *"The customer never types the area — a typed area that disagrees
     * with the dimensions is a support ticket waiting to happen."* Proven twice: the derived
     * value is right, and an `areaM2` in the payload is ignored rather than honoured.
     */
    const actor = await customer('usr_area')
    const projectId = await draftFor(actor)

    const saved = await patchStep(actor, {
      projectId,
      step: 'dimensions',
      data: { widthMm: 5000, depthMm: 4000, heightMm: 2800, areaM2: 999 },
    })

    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(saved.value.areaM2, '5 m × 4 m').toBe(20)
    expect(saved.value.areaM2).not.toBe(999)
  }, 120_000)
})

describe('the point is resolved when the step is saved', () => {
  it('falls back to the district centroid and says so', async () => {
    /*
     * The decision in `04` §Project. Resolving at match time instead would make
     * `ST_DWithin(..., NULL, ...)` return NULL and GiST skip the row, so every radius service
     * area would silently miss.
     */
    const actor = await customer('usr_point_district')
    const projectId = await draftFor(actor)

    const saved = await patchStep(actor, {
      projectId,
      step: 'location',
      data: { cityId, districtId },
    })

    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(saved.value.pointPrecision).toBe('DISTRICT')

    const point = await getPoint('Project', projectId)
    expect(point).not.toBeNull()
    expect(point?.latitude).toBeCloseTo(DISTRICT_POINT.latitude, 4)
    expect(point?.longitude).toBeCloseTo(DISTRICT_POINT.longitude, 4)
  }, 120_000)

  it('uses the customer’s pin when there is one, and marks it exact', async () => {
    const actor = await customer('usr_point_exact')
    const projectId = await draftFor(actor)

    const saved = await patchStep(actor, {
      projectId,
      step: 'location',
      data: { cityId, districtId, latitude: PIN.latitude, longitude: PIN.longitude },
    })

    if (!saved.ok) return
    expect(saved.value.pointPrecision).toBe('EXACT')

    const point = await getPoint('Project', projectId)
    expect(point?.latitude).toBeCloseTo(PIN.latitude, 4)
    // And it is *not* the district centroid, or the assertion above would pass on a fallback.
    expect(point?.latitude).not.toBeCloseTo(DISTRICT_POINT.latitude, 2)
  }, 120_000)
})

describe('a deactivated option', () => {
  it('still renders and stays selected on a project that chose it, and is gone from a new one', async () => {
    /*
     * `10` §Admin authoring: *"deactivating an option — hidden from new projects; existing
     * `ProjectAttributeValue` rows keep referencing it and still render."*
     *
     * That is a **customer** rule. Without it, somebody who left a draft half-finished returns
     * to find their answer vanished — and if the attribute is required, readiness reports a
     * question they cannot see. It hits the customer who waited longest.
     */
    const actor = await customer('usr_deactivated')
    const projectId = await draftFor(actor)

    await patchStep(actor, {
      projectId,
      step: 'options',
      data: { values: [{ attributeId, optionId: optionA }] },
    })

    await getPrisma().productOption.update({
      where: { id: optionA },
      data: { isActive: false },
    })

    // The project still references it, so the read must include it.
    const withProject = await getConfigurableProduct(anonymousActor(), {
      productId,
      includeOptionIds: [optionA],
    })

    expect(withProject.ok).toBe(true)
    if (!withProject.ok) return

    const attribute = withProject.value.product.attributes.find((row) => row.id === attributeId)
    const optionIds = (attribute?.options ?? []).map((option) => option.id)

    expect(optionIds, 'the chosen option survives deactivation').toContain(optionA)
    expect(optionIds).toContain(optionB)

    // A fresh project has no such reference, so it must not be offered.
    const fresh = await getConfigurableProduct(anonymousActor(), { productId })
    if (!fresh.ok) return

    const freshAttribute = fresh.value.product.attributes.find((row) => row.id === attributeId)
    const freshOptionIds = (freshAttribute?.options ?? []).map((option) => option.id)

    expect(freshOptionIds, 'a new project is not offered a retired option').not.toContain(optionA)
    expect(freshOptionIds).toContain(optionB)

    // Restore, so the ordering of tests in this file cannot matter.
    await getPrisma().productOption.update({ where: { id: optionA }, data: { isActive: true } })
  }, 120_000)
})

describe('readiness', () => {
  it('reports issues with the step they belong to', async () => {
    const actor = await customer('usr_readiness')
    const projectId = await draftFor(actor)

    const result = await validateProject(actor, { projectId })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.ready).toBe(false)
    expect(result.value.status).toBe('DRAFT')

    // `10` §Validation asks for this by name: the summary links straight to the field.
    const steps = new Set(result.value.issues.map((issue) => issue.step))
    expect(steps).toContain('dimensions')
    expect(steps).toContain('location')
    expect(result.value.issues.every((issue) => issue.stage !== undefined)).toBe(true)
  }, 120_000)

  it('does not move or misreport a SUBMITTED project', async () => {
    // Both halves of the first status bug: the stored value must not change, and the returned
    // value must be the stored one rather than the computed one.
    const actor = await customer('usr_submitted')
    const projectId = await draftFor(actor)

    await getPrisma().project.update({ where: { id: projectId }, data: { status: 'SUBMITTED' } })

    const result = await validateProject(actor, { projectId })
    if (!result.ok) return

    expect(result.value.status, 'the persisted status is what comes back').toBe('SUBMITTED')

    const stored = await getPrisma().project.findUnique({ where: { id: projectId } })
    expect(stored?.status).toBe('SUBMITTED')
  }, 120_000)

  it('does not resurrect a CLOSED project', async () => {
    // The second status bug: the edit path refused CLOSED, the validation path did not.
    const actor = await customer('usr_closed')
    const projectId = await draftFor(actor)

    await getPrisma().project.update({ where: { id: projectId }, data: { status: 'CLOSED' } })

    const result = await validateProject(actor, { projectId })
    if (!result.ok) return

    expect(result.value.status).toBe('CLOSED')

    const stored = await getPrisma().project.findUnique({ where: { id: projectId } })
    expect(stored?.status).toBe('CLOSED')
  }, 120_000)

  it('refuses to edit a terminal project at all', async () => {
    const actor = await customer('usr_terminal_edit')
    const projectId = await draftFor(actor)

    await getPrisma().project.update({ where: { id: projectId }, data: { status: 'SUBMITTED' } })

    const attempt = await patchStep(actor, {
      projectId,
      step: 'dimensions',
      data: { widthMm: 1000 },
    })

    expect(attempt.ok).toBe(false)
    if (attempt.ok) return
    expect(attempt.error.kind).toBe('PRECONDITION')
  }, 120_000)

  it('reaches READY, and an edit sends it back to DRAFT', async () => {
    const actor = await customer('usr_ready')
    const projectId = await draftFor(actor)

    await patchStep(actor, {
      projectId,
      step: 'dimensions',
      data: { widthMm: 5000, depthMm: 4000, heightMm: 2800 },
    })
    await patchStep(actor, { projectId, step: 'projectType', data: { projectType: 'NEW_BUILD' } })
    await patchStep(actor, {
      projectId,
      step: 'installationType',
      data: { installationType: 'FREESTANDING' },
    })
    await patchStep(actor, { projectId, step: 'location', data: { cityId, districtId } })

    const colour = await getPrisma().productOption.findFirst({
      where: { attributeId: requiredAttributeId },
    })
    await patchStep(actor, {
      projectId,
      step: 'options',
      data: { values: [{ attributeId: requiredAttributeId, optionId: colour?.id }] },
    })

    const ready = await validateProject(actor, { projectId })
    if (!ready.ok) return

    expect(ready.value.issues, JSON.stringify(ready.value.issues)).toEqual([])
    expect(ready.value.ready).toBe(true)
    expect(ready.value.status).toBe('READY')

    /*
     * And editing takes it back. It was READY against the *old* values; keeping the flag is
     * how a stale readiness reaches Phase 6's offer request.
     */
    const edited = await patchStep(actor, {
      projectId,
      step: 'dimensions',
      data: { widthMm: 6000 },
    })
    if (!edited.ok) return
    expect(edited.value.status).toBe('DRAFT')
  }, 180_000)
})
