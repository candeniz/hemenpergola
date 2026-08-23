import { beforeAll, describe, expect, it } from 'vitest'

import {
  addAttachment,
  claimProject,
  createProject,
  duplicateProject,
  getProject,
  listProjects,
  patchStep,
} from '@/modules/project/application/project-service'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'
import { MAX_ANONYMOUS_DRAFTS_PER_KEY } from '@/shared/context/anonymous-key'

import { getPrisma } from './setup'

/**
 * Task 4.5, against a real database — plus the parts of 4.6 and 4.9 that only a real database
 * can answer.
 *
 * `26` §Phase 4 calls 4.5 the riskiest task in the phase: *"where sessions, cookies, retention
 * and ownership checks intersect, and the one flow a customer hits before they trust you."*
 * Everything below is an integration test because the thing being proved is a **constraint**,
 * a `where` clause or a row transition — none of which exist in a unit test.
 *
 * The single most important assertion in this file is `claims in one statement`. `04`'s
 * `CHECK ((customerId IS NULL) <> (anonymousKey IS NULL))` rejects the intermediate state, and
 * a two-statement implementation fails at the *first* statement — which looks like a broken
 * constraint rather than like an ordering mistake. It has to be proved against the constraint
 * that would reject it.
 */

let productId = ''

const KEY_A = 'a'.repeat(43)
const KEY_B = 'b'.repeat(43)

function visitor(key: string): ActorContext {
  return anonymousActor({ anonymousKey: key, ip: '203.0.113.7' })
}

async function customer(id: string): Promise<ActorContext> {
  await getPrisma().user.upsert({
    where: { id },
    create: { id, email: `${id}@example.com`, emailVerifiedAt: new Date() },
    update: {},
  })

  return anonymousActor({ userId: id, globalRole: 'CUSTOMER', ip: '203.0.113.8' })
}

/** A signed-in customer whose browser still holds a draft cookie — the claim's actual shape. */
async function customerHolding(id: string, key: string): Promise<ActorContext> {
  return { ...(await customer(id)), anonymousKey: key }
}

beforeAll(async () => {
  const category = await getPrisma().category.create({ data: { sortOrder: 1 } })
  const product = await getPrisma().product.create({
    data: { categoryId: category.id, basisType: 'AREA_M2' },
  })
  productId = product.id
})

describe('anonymous drafts', () => {
  it('creates a project owned by a cookie and by nothing else', async () => {
    const key = `${KEY_A.slice(0, 40)}c01`
    const created = await createProject(visitor(key), { productId })

    expect(created.ok).toBe(true)
    if (!created.ok) return

    const row = await getPrisma().project.findUnique({
      where: { id: created.value.projectId },
      select: { customerId: true, anonymousKey: true },
    })

    // Exactly one owner — the shape `04`'s CHECK constraint enforces, asserted rather than
    // assumed, because it is what every later `where` clause here depends on.
    expect(row?.anonymousKey).toBe(key)
    expect(row?.customerId).toBeNull()
  })

  it('refuses a caller with neither a user nor a key', async () => {
    const created = await createProject(anonymousActor(), { productId })

    expect(created.ok).toBe(false)
    if (created.ok) return
    expect(created.error.kind).toBe('PRECONDITION')
  })

  it(`allows ${MAX_ANONYMOUS_DRAFTS_PER_KEY} drafts per key and refuses the next`, async () => {
    const key = `${KEY_A.slice(0, 40)}c02`
    const caller = visitor(key)

    for (let index = 0; index < MAX_ANONYMOUS_DRAFTS_PER_KEY; index += 1) {
      expect((await createProject(caller, { productId })).ok, `draft ${index + 1}`).toBe(true)
    }

    const overflow = await createProject(caller, { productId })

    expect(overflow.ok).toBe(false)
    if (overflow.ok) return
    expect(overflow.error.kind).toBe('CONFLICT')

    // Counted in rows: the ceiling is about what exists, not about what the browser claims.
    expect(await getPrisma().project.count({ where: { anonymousKey: key } })).toBe(
      MAX_ANONYMOUS_DRAFTS_PER_KEY,
    )
  })

  it('does not let one key read another key’s draft', async () => {
    const created = await createProject(visitor(`${KEY_A.slice(0, 40)}c03`), { productId })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const other = await getProject(visitor(`${KEY_B.slice(0, 40)}c04`), {
      projectId: created.value.projectId,
    })

    // `NOT_FOUND`, not `FORBIDDEN`: ownership is in the `where` clause, so the row never comes
    // back, and a 403 would confirm the project exists to somebody who does not own it.
    expect(other.ok).toBe(false)
    if (other.ok) return
    expect(other.error.kind).toBe('NOT_FOUND')
  })

  it('lists only the drafts a key holds', async () => {
    const key = `${KEY_A.slice(0, 40)}c05`
    await createProject(visitor(key), { productId })
    await createProject(visitor(key), { productId })
    await createProject(visitor(`${KEY_B.slice(0, 40)}c06`), { productId })

    const listed = await listProjects(visitor(key), {})

    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.value.projects).toHaveLength(2)
  })
})

describe('claiming', () => {
  it('claims in one statement, so the XOR constraint is never violated', async () => {
    const key = `${KEY_A.slice(0, 40)}d01`
    const created = await createProject(visitor(key), { productId })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const claimed = await claimProject(await customerHolding('usr-claim-1', key), {
      projectId: created.value.projectId,
    })

    expect(claimed.ok).toBe(true)
    if (!claimed.ok) return
    expect(claimed.value.claimed).toBe(true)

    /*
     * Both columns, read back from the row. The return value would be just as green if the
     * service had written `customerId` and left the key in place — and the row would then
     * violate `04`'s constraint, or rather would have failed to be written at all. This is
     * the assertion that distinguishes the two.
     */
    const row = await getPrisma().project.findUnique({
      where: { id: created.value.projectId },
      select: { customerId: true, anonymousKey: true },
    })

    expect(row?.customerId).toBe('usr-claim-1')
    expect(row?.anonymousKey).toBeNull()
  })

  it('refuses a claim whose cookie does not match — id guessing does not work', async () => {
    const created = await createProject(visitor(`${KEY_A.slice(0, 40)}d02`), { productId })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    /*
     * A signed-in account, a valid project id, and *somebody else's* cookie. This is the
     * attack the endpoint exists to refuse: the ids are the only thing between a draft's
     * dimensions, address note and photos and anybody who can iterate.
     */
    const attacker = await customerHolding('usr-claim-2', `${KEY_B.slice(0, 40)}d03`)
    const stolen = await claimProject(attacker, { projectId: created.value.projectId })

    expect(stolen.ok).toBe(false)
    if (stolen.ok) return
    expect(stolen.error.kind).toBe('NOT_FOUND')

    const row = await getPrisma().project.findUnique({
      where: { id: created.value.projectId },
      select: { customerId: true },
    })

    expect(row?.customerId, 'the draft still belongs to nobody').toBeNull()
  })

  it('refuses a claim from a caller with no cookie at all', async () => {
    const created = await createProject(visitor(`${KEY_A.slice(0, 40)}d04`), { productId })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const bare = await claimProject(await customer('usr-claim-3'), {
      projectId: created.value.projectId,
    })

    expect(bare.ok).toBe(false)
    if (bare.ok) return
    expect(bare.error.kind).toBe('NOT_FOUND')
  })

  it('refuses a claim from a caller with no account', async () => {
    const key = `${KEY_A.slice(0, 40)}d05`
    const created = await createProject(visitor(key), { productId })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const anonymous = await claimProject(visitor(key), { projectId: created.value.projectId })

    expect(anonymous.ok).toBe(false)
    if (anonymous.ok) return
    expect(anonymous.error.kind).toBe('PRECONDITION')
  })

  it('is idempotent: claiming twice is not an error', async () => {
    const key = `${KEY_A.slice(0, 40)}d06`
    const created = await createProject(visitor(key), { productId })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const caller = await customerHolding('usr-claim-4', key)

    const first = await claimProject(caller, { projectId: created.value.projectId })
    const second = await claimProject(caller, { projectId: created.value.projectId })

    expect(first.ok && first.value.claimed).toBe(true)

    // A customer who double-submits must not be told their own project does not exist.
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.value.claimed).toBe(false)
  })

  it('leaves the draft unreachable by the key that used to own it', async () => {
    const key = `${KEY_A.slice(0, 40)}d07`
    const created = await createProject(visitor(key), { productId })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    await claimProject(await customerHolding('usr-claim-5', key), {
      projectId: created.value.projectId,
    })

    const stranded = await getProject(visitor(key), { projectId: created.value.projectId })

    expect(stranded.ok).toBe(false)
    if (stranded.ok) return
    expect(stranded.error.kind).toBe('NOT_FOUND')
  })

  it('writes an audit entry, because a successful claim destroys its own evidence', async () => {
    const key = `${KEY_A.slice(0, 40)}d08`
    const created = await createProject(visitor(key), { productId })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    await claimProject(await customerHolding('usr-claim-6', key), {
      projectId: created.value.projectId,
    })

    const entry = await getPrisma().auditLog.findFirst({
      where: { action: 'project_claimed', entityId: created.value.projectId },
    })

    expect(entry, 'the only place a row changes owner should say so').not.toBeNull()
  })

  it('carries the draft’s answers across the claim untouched', async () => {
    const key = `${KEY_A.slice(0, 40)}d09`
    const created = await createProject(visitor(key), { productId })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    await patchStep(visitor(key), {
      projectId: created.value.projectId,
      step: 'dimensions',
      data: { widthMm: 5000, depthMm: 4000 },
    })

    await claimProject(await customerHolding('usr-claim-7', key), {
      projectId: created.value.projectId,
    })

    const mine = await getProject(await customer('usr-claim-7'), {
      projectId: created.value.projectId,
    })

    expect(mine.ok).toBe(true)
    if (!mine.ok) return

    // The whole point of claiming rather than starting again: 20 m², derived before the
    // account existed and unchanged by the change of owner.
    expect(mine.value.widthMm).toBe(5000)
    expect(mine.value.areaM2).toBe(20)
  })
})

describe('attachments — task 4.6', () => {
  it('links a file an anonymous visitor uploaded to their own draft', async () => {
    const key = `${KEY_A.slice(0, 40)}e01`
    const created = await createProject(visitor(key), { productId })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    /*
     * The `File` row as `presignUpload` leaves it. The storage key is addressed by
     * `PROJECT/<projectId>`, never by a customer — which is why a claim moves no objects.
     */
    const file = await getPrisma().file.create({
      data: {
        key: `protected/project/${created.value.projectId}/f1.jpg`,
        bucket: 'test',
        mime: 'image/jpeg',
        sizeBytes: 1234,
        ownerType: 'PROJECT',
        ownerId: created.value.projectId,
        uploadedBy: null,
      },
    })

    const linked = await addAttachment(visitor(key), {
      projectId: created.value.projectId,
      fileId: file.id,
    })

    expect(linked.ok).toBe(true)
    if (!linked.ok) return

    expect(linked.value.attachments).toHaveLength(1)
    // Derived from the MIME type, never asked for.
    expect(linked.value.attachments[0]?.kind).toBe('PHOTO')
  })

  it('refuses a file that belongs to another project', async () => {
    const key = `${KEY_A.slice(0, 40)}e02`
    const mine = await createProject(visitor(key), { productId })
    const theirs = await createProject(visitor(`${KEY_B.slice(0, 40)}e03`), { productId })
    expect(mine.ok && theirs.ok).toBe(true)
    if (!mine.ok || !theirs.ok) return

    const file = await getPrisma().file.create({
      data: {
        key: `protected/project/${theirs.value.projectId}/f2.pdf`,
        bucket: 'test',
        mime: 'application/pdf',
        sizeBytes: 4321,
        ownerType: 'PROJECT',
        ownerId: theirs.value.projectId,
        uploadedBy: null,
      },
    })

    const linked = await addAttachment(visitor(key), {
      projectId: mine.value.projectId,
      fileId: file.id,
    })

    expect(linked.ok).toBe(false)
    if (linked.ok) return
    expect(linked.error.kind).toBe('NOT_FOUND')
  })

  it('is idempotent, so a retried upload does not double-link', async () => {
    const key = `${KEY_A.slice(0, 40)}e04`
    const created = await createProject(visitor(key), { productId })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const file = await getPrisma().file.create({
      data: {
        key: `protected/project/${created.value.projectId}/f3.pdf`,
        bucket: 'test',
        mime: 'application/pdf',
        sizeBytes: 999,
        ownerType: 'PROJECT',
        ownerId: created.value.projectId,
        uploadedBy: null,
      },
    })

    await addAttachment(visitor(key), { projectId: created.value.projectId, fileId: file.id })
    const again = await addAttachment(visitor(key), {
      projectId: created.value.projectId,
      fileId: file.id,
    })

    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.value.attachments).toHaveLength(1)
    expect(again.value.attachments[0]?.kind).toBe('DOCUMENT')
  })
})

describe('duplicate — task 4.9', () => {
  it('copies the answers but not the attachments and not the status', async () => {
    const caller = await customer('usr-dup-1')

    const created = await createProject(caller, { productId })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    await patchStep(caller, {
      projectId: created.value.projectId,
      step: 'dimensions',
      data: { widthMm: 6000, depthMm: 3000 },
    })

    const file = await getPrisma().file.create({
      data: {
        key: `protected/project/${created.value.projectId}/f4.jpg`,
        bucket: 'test',
        mime: 'image/jpeg',
        sizeBytes: 100,
        ownerType: 'PROJECT',
        ownerId: created.value.projectId,
        uploadedBy: null,
      },
    })
    await addAttachment(caller, { projectId: created.value.projectId, fileId: file.id })

    // A `READY` source, so "status is not copied" is a real assertion rather than a tautology.
    await getPrisma().project.update({
      where: { id: created.value.projectId },
      data: { status: 'READY' },
    })

    const copied = await duplicateProject(caller, { projectId: created.value.projectId })
    expect(copied.ok).toBe(true)
    if (!copied.ok) return

    const copy = await getProject(caller, { projectId: copied.value.projectId })
    expect(copy.ok).toBe(true)
    if (!copy.ok) return

    expect(copy.value.widthMm).toBe(6000)
    expect(copy.value.areaM2).toBe(18)

    // `10` §Reuse, both exclusions.
    expect(copy.value.attachments).toHaveLength(0)
    expect(copy.value.status).toBe('DRAFT')
  })

  it('does not let a duplicate walk past the anonymous ceiling', async () => {
    const key = `${KEY_A.slice(0, 40)}f01`
    const caller = visitor(key)

    const first = await createProject(caller, { productId })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    await createProject(caller, { productId })
    await createProject(caller, { productId })

    const copied = await duplicateProject(caller, { projectId: first.value.projectId })

    // Otherwise "duplicate" is an unauthenticated way past a limit the create path enforces.
    expect(copied.ok).toBe(false)
    if (copied.ok) return
    expect(copied.error.kind).toBe('CONFLICT')
  })

  it('refuses to duplicate a project the caller does not own', async () => {
    const created = await createProject(await customer('usr-dup-2'), { productId })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const copied = await duplicateProject(await customer('usr-dup-3'), {
      projectId: created.value.projectId,
    })

    expect(copied.ok).toBe(false)
    if (copied.ok) return
    expect(copied.error.kind).toBe('NOT_FOUND')
  })
})
