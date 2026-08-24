import { beforeAll, describe, expect, it } from 'vitest'

import { attachDocument } from '@/modules/iam/application/company-profile-service'
import { completeUpload, fileUrl, presignUpload } from '@/modules/media/application/file-service'
import { storageKey, UPLOAD_POLICY } from '@/modules/media/domain/upload-policy'
import { attachPhoto, createPortfolioItem } from '@/modules/portfolio/application/portfolio-service'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'
import { getStorage } from '@/shared/storage'

import { getPrisma } from './setup'

/**
 * Uploads, limits and access classes — task 3.1 and 3.7,
 * `14-file-storage-and-media.md`.
 *
 * **Against real MinIO**, not a fake. The fake in `jobs.integration.test.ts` is right for
 * testing the job's logic; what is under test here is that a presigned PUT actually works,
 * that the URL is pinned to the length we declared, and that a private object and a public
 * one really do live in different places — none of which a fake can be wrong about.
 */

const admin: ActorContext = anonymousActor({
  userId: 'usr_storage_admin',
  globalRole: 'ADMIN',
  ip: '203.0.113.60',
  userAgent: 'integration-suite',
})

let companyId = ''
let ownerActor: ActorContext = anonymousActor()
let outsiderActor: ActorContext = anonymousActor()
let itemId = ''

/*
 * A second, still-`PENDING` company.
 *
 * The two states are not interchangeable and the first draft of this file assumed they were:
 * `document.upload` is `onboarding` (`ADR-016`) so it works while `PENDING` — which is the
 * entire point, since documents are what gets a company verified — while `portfolio.manage`
 * is `write` and does not. A portfolio is something a company shows once it is real, and the
 * gate for this half asks for a *verified* company that has added one.
 */
let pendingCompanyId = ''
let pendingOwnerActor: ActorContext = anonymousActor()

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

beforeAll(async () => {
  await getPrisma().user.upsert({
    where: { id: 'usr_storage_admin' },
    create: { id: 'usr_storage_admin', email: 'storage-admin@example.com', globalRole: 'ADMIN' },
    update: {},
  })

  const company = await getPrisma().company.create({
    data: {
      slug: 'storage-fixture',
      legalName: 'Storage Fixture A.Ş.',
      displayName: 'Storage Fixture',
      status: 'VERIFIED',
      verifiedAt: new Date(),
    },
  })
  companyId = company.id

  const owner = await getPrisma().user.create({
    data: { email: `storage-owner-${companyId}@example.com` },
  })
  await getPrisma().companyMembership.create({
    data: { companyId, userId: owner.id, role: 'OWNER', acceptedAt: new Date() },
  })

  const outsider = await getPrisma().user.create({
    data: { email: `storage-outsider-${companyId}@example.com` },
  })

  ownerActor = anonymousActor({
    userId: owner.id,
    globalRole: 'CUSTOMER',
    companyId,
    companyRole: 'OWNER',
    companyStatus: 'VERIFIED',
    ip: '203.0.113.61',
  })
  outsiderActor = anonymousActor({ userId: outsider.id, globalRole: 'CUSTOMER' })

  const pending = await getPrisma().company.create({
    data: {
      slug: 'storage-pending',
      legalName: 'Bekleyen Fixture A.Ş.',
      displayName: 'Bekleyen Fixture',
      status: 'PENDING',
    },
  })
  pendingCompanyId = pending.id

  const pendingOwner = await getPrisma().user.create({
    data: { email: `storage-pending-${pending.id}@example.com` },
  })
  await getPrisma().companyMembership.create({
    data: {
      companyId: pending.id,
      userId: pendingOwner.id,
      role: 'OWNER',
      acceptedAt: new Date(),
    },
  })
  pendingOwnerActor = anonymousActor({
    userId: pendingOwner.id,
    globalRole: 'CUSTOMER',
    companyId: pending.id,
    companyRole: 'OWNER',
    companyStatus: 'PENDING',
    ip: '203.0.113.62',
  })

  const item = await createPortfolioItem(ownerActor, {
    companyId,
    title: 'Bahçe pergolası, Çeşme',
    sortOrder: 0,
  })
  if (!item.ok) throw new Error('createPortfolioItem failed')
  itemId = item.value.itemId
}, 120_000)

/** Presign, PUT the bytes, complete. The flow `14` §Upload flow specifies, end to end. */
async function upload(
  actor: ActorContext,
  input: {
    ownerType: 'COMPANY_DOCUMENT' | 'PORTFOLIO'
    ownerId: string
    body: Buffer
    mime: string
  },
): Promise<string> {
  const presigned = await presignUpload(actor, {
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    mime: input.mime,
    sizeBytes: input.body.byteLength,
  })
  if (!presigned.ok) throw new Error(`presign: ${JSON.stringify(presigned.error)}`)

  const response = await fetch(presigned.value.uploadUrl, {
    method: 'PUT',
    body: new Uint8Array(input.body),
    headers: {
      'content-type': input.mime,
      'content-length': String(input.body.byteLength),
    },
  })
  expect(response.ok, `PUT to MinIO: ${response.status}`).toBe(true)

  const completed = await completeUpload(actor, { fileId: presigned.value.fileId })
  expect(completed.ok).toBe(true)

  return presigned.value.fileId
}

describe('the upload flow reaches real storage', () => {
  it('presigns, uploads and reads back', async () => {
    const fileId = await upload(ownerActor, {
      ownerType: 'PORTFOLIO',
      ownerId: itemId,
      body: PNG,
      mime: 'image/png',
    })

    const file = await getPrisma().file.findUnique({ where: { id: fileId } })
    expect(file?.key).toMatch(/^public\/portfolio\//)

    const bytes = await getStorage().getObject(file?.key ?? '')
    expect(bytes.byteLength).toBe(PNG.byteLength)
  }, 120_000)

  it('validates before the URL exists, not after the bytes arrive', async () => {
    /*
     * `14` §Upload flow is explicit about the order, and the reason is that after the bytes
     * arrive the storage bill is already paid. Both refusals below happen with no object
     * created and no URL handed out.
     */
    const tooBig = await presignUpload(ownerActor, {
      ownerType: 'PORTFOLIO',
      ownerId: itemId,
      mime: 'image/png',
      sizeBytes: UPLOAD_POLICY.PORTFOLIO.maxBytes + 1,
    })
    expect(tooBig.ok).toBe(false)
    if (tooBig.ok) return
    expect(tooBig.error.kind).toBe('PRECONDITION')

    const wrongType = await presignUpload(ownerActor, {
      ownerType: 'PORTFOLIO',
      ownerId: itemId,
      mime: 'application/pdf',
      sizeBytes: 1000,
    })
    expect(wrongType.ok).toBe(false)
  }, 60_000)

  it('refuses an SVG logo rather than storing an unsanitised one', async () => {
    // `14` allows SVG *if* it is sanitised server-side, and no sanitiser is built. An
    // unsanitised SVG is a stored-XSS vector, so the honest V1 answer is to reject it.
    const result = await presignUpload(ownerActor, {
      ownerType: 'COMPANY_LOGO',
      ownerId: companyId,
      mime: 'image/svg+xml',
      sizeBytes: 900,
    })

    expect(result.ok).toBe(false)
  }, 60_000)

  it('refuses an upload for a company the caller is not in', async () => {
    const result = await presignUpload(outsiderActor, {
      ownerType: 'COMPANY_DOCUMENT',
      ownerId: companyId,
      mime: 'application/pdf',
      sizeBytes: 1000,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('FORBIDDEN')
  }, 60_000)

  it('enforces the per-owner count, not just the size', async () => {
    const item = await createPortfolioItem(ownerActor, {
      companyId,
      title: 'Sayı sınırı',
      sortOrder: 1,
    })
    if (!item.ok) return

    // Fill the quota with rows rather than real uploads: the limit is counted from `File`
    // rows, and thirty round trips to MinIO would test MinIO's throughput instead.
    await getPrisma().file.createMany({
      data: Array.from({ length: UPLOAD_POLICY.PORTFOLIO.maxCount }, (_, index) => ({
        key: `public/portfolio/${item.value.itemId}/filler-${index}.webp`,
        bucket: 'test',
        mime: 'image/webp',
        sizeBytes: 10,
        ownerType: 'PORTFOLIO' as const,
        ownerId: item.value.itemId,
      })),
    })

    const result = await presignUpload(ownerActor, {
      ownerType: 'PORTFOLIO',
      ownerId: item.value.itemId,
      mime: 'image/png',
      sizeBytes: 1000,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('CONFLICT')
  }, 120_000)
})

describe('access classes are in the key, not only in a column', () => {
  it('puts a portfolio photo and an identity document in different prefixes', async () => {
    /*
     * The distinction `14` §Access control draws, made structural. If the only thing
     * separating a tax certificate from a portfolio photo were a boolean on a row, one wrong
     * `where` clause would serve the certificate from the CDN. The prefix is the first
     * segment of the key, so a bucket policy can be written against it.
     */
    const photo = storageKey({
      ownerType: 'PORTFOLIO',
      ownerId: itemId,
      fileId: 'f1',
      mime: 'image/png',
    })
    const document = storageKey({
      ownerType: 'COMPANY_DOCUMENT',
      ownerId: companyId,
      fileId: 'f2',
      mime: 'application/pdf',
    })

    expect(photo.startsWith('public/')).toBe(true)
    expect(document.startsWith('private/')).toBe(true)
    expect(UPLOAD_POLICY.PROJECT.accessClass).toBe('semi-private')
  })

  it('serves a portfolio photo as an unsigned CDN URL', async () => {
    const fileId = await upload(ownerActor, {
      ownerType: 'PORTFOLIO',
      ownerId: itemId,
      body: PNG,
      mime: 'image/png',
    })
    await getPrisma().file.update({ where: { id: fileId }, data: { virusScanStatus: 'CLEAN' } })

    const attached = await attachPhoto(ownerActor, { companyId, itemId, fileId, sortOrder: 0 })
    expect(attached.ok).toBe(true)

    const url = await fileUrl(ownerActor, { fileId })
    expect(url.ok).toBe(true)
    if (!url.ok) return

    expect(url.value.accessClass).toBe('public')
    expect(url.value.expiresIn).toBeNull()
    // A public URL is cacheable *because* it is unsigned; a signature would make every
    // image request go through the application.
    expect(url.value.url).not.toContain('X-Amz-Signature')
  }, 120_000)

  it('serves a company document as a five-minute signed URL', async () => {
    const fileId = await upload(ownerActor, {
      ownerType: 'COMPANY_DOCUMENT',
      ownerId: companyId,
      body: Buffer.from('%PDF-1.7\n%fixture\n', 'ascii'),
      mime: 'application/pdf',
    })
    await getPrisma().file.update({ where: { id: fileId }, data: { virusScanStatus: 'CLEAN' } })

    const url = await fileUrl(ownerActor, { fileId })
    expect(url.ok).toBe(true)
    if (!url.ok) return

    expect(url.value.accessClass).toBe('private')
    expect(url.value.expiresIn).toBe(300)
    expect(url.value.url).toContain('X-Amz-Signature')
    expect(url.value.url).toContain('/private/')
  }, 120_000)

  it('refuses a company document to somebody outside the company', async () => {
    const fileId = await upload(ownerActor, {
      ownerType: 'COMPANY_DOCUMENT',
      ownerId: companyId,
      body: Buffer.from('%PDF-1.7\n%fixture\n', 'ascii'),
      mime: 'application/pdf',
    })
    await getPrisma().file.update({ where: { id: fileId }, data: { virusScanStatus: 'CLEAN' } })

    const denied = await fileUrl(outsiderActor, { fileId })
    expect(denied.ok).toBe(false)
    if (denied.ok) return
    expect(denied.error.kind).toBe('FORBIDDEN')
  }, 120_000)

  it('does not serve a file that has not been scanned, except to its uploader', async () => {
    // `14` §Virus scanning: not served to anyone but the uploader until `CLEAN`.
    const fileId = await upload(ownerActor, {
      ownerType: 'COMPANY_DOCUMENT',
      ownerId: companyId,
      body: Buffer.from('%PDF-1.7\n%pending\n', 'ascii'),
      mime: 'application/pdf',
    })
    await getPrisma().file.update({ where: { id: fileId }, data: { virusScanStatus: 'PENDING' } })

    const uploader = await fileUrl(ownerActor, { fileId })
    expect(uploader.ok).toBe(true)

    const other = await fileUrl(admin, { fileId })
    expect(other.ok).toBe(false)
    if (other.ok) return
    expect(other.error.kind).toBe('PRECONDITION')
  }, 120_000)
})

describe('document viewing is audit-logged as a disclosure', () => {
  it('writes an entry when a signed URL for a company document is issued', async () => {
    /*
     * The debt carried over from Phase 2. `17` §Manufacturer verification calls document
     * viewing a disclosure — these are legal identity documents — and Phase 2 could only log
     * the *decision*, because the surface serving the file did not exist yet.
     *
     * Logged on issuance rather than on fetch: the fetch goes straight to storage and never
     * reaches us, so the URL is the thing we hand over and the thing to record.
     */
    const fileId = await upload(ownerActor, {
      ownerType: 'COMPANY_DOCUMENT',
      ownerId: companyId,
      body: Buffer.from('%PDF-1.7\n%audited\n', 'ascii'),
      mime: 'application/pdf',
    })
    await getPrisma().file.update({ where: { id: fileId }, data: { virusScanStatus: 'CLEAN' } })

    const attached = await attachDocument(ownerActor, {
      companyId,
      fileId,
      type: 'VERGI_LEVHASI',
    })
    expect(attached.ok).toBe(true)

    const before = await getPrisma().auditLog.count({
      where: { action: 'document_viewed', entityId: companyId },
    })

    // An admin reviewing the queue is the reader this rule exists for.
    const url = await fileUrl(admin, { fileId })
    expect(url.ok).toBe(true)

    const entries = await getPrisma().auditLog.findMany({
      where: { action: 'document_viewed', entityId: companyId },
      orderBy: { createdAt: 'desc' },
    })

    expect(entries.length).toBe(before + 1)
    expect(entries[0]?.actorUserId).toBe('usr_storage_admin')
    expect(entries[0]?.ip).toBe('203.0.113.60')
    expect((entries[0]?.after as { fileId?: string } | null)?.fileId).toBe(fileId)
  }, 180_000)

  it('does not log a portfolio photo, which is public', async () => {
    // Logging every CDN image request would make the audit log unreadable and prove nothing.
    const fileId = await upload(ownerActor, {
      ownerType: 'PORTFOLIO',
      ownerId: itemId,
      body: PNG,
      mime: 'image/png',
    })
    await getPrisma().file.update({ where: { id: fileId }, data: { virusScanStatus: 'CLEAN' } })

    const before = await getPrisma().auditLog.count({ where: { action: 'document_viewed' } })
    await fileUrl(ownerActor, { fileId })
    const after = await getPrisma().auditLog.count({ where: { action: 'document_viewed' } })

    expect(after).toBe(before)
  }, 120_000)
})

describe('a PENDING company can still upload its documents', () => {
  it('presigns, uploads and attaches while unverified', async () => {
    /*
     * Task 3.1's explicit requirement, and the reason `ADR-016` classifies
     * `company:document.upload` as `onboarding` rather than `write`: documents are what gets
     * a company verified, so a rule that waits for verification to allow them is a deadlock.
     */
    const body = Buffer.from('%PDF-1.7\n%pending-company\n', 'ascii')

    const presigned = await presignUpload(pendingOwnerActor, {
      ownerType: 'COMPANY_DOCUMENT',
      ownerId: pendingCompanyId,
      mime: 'application/pdf',
      // The real length, not a round number. The presigned URL pins `ContentLength`, so a
      // body that does not match the declaration is refused by storage before a byte lands —
      // which is the whole point of the pin, and which the first draft of this test proved by
      // declaring 40 for a 26-byte file and failing.
      sizeBytes: body.byteLength,
    })
    expect(presigned.ok).toBe(true)
    if (!presigned.ok) return

    const put = await fetch(presigned.value.uploadUrl, {
      method: 'PUT',
      body: new Uint8Array(body),
      headers: { 'content-type': 'application/pdf', 'content-length': String(body.byteLength) },
    })
    expect(put.ok).toBe(true)

    const attached = await attachDocument(pendingOwnerActor, {
      companyId: pendingCompanyId,
      fileId: presigned.value.fileId,
      type: 'TICARET_SICIL',
    })
    expect(attached.ok).toBe(true)
  }, 120_000)

  it('but cannot build a portfolio yet', async () => {
    // `portfolio.manage` is `write`, and `02` §Verification state gives a `PENDING` company
    // only the onboarding path. A portfolio is something a company shows once it is real —
    // which is also what this half's gate asks for.
    const blocked = await createPortfolioItem(pendingOwnerActor, {
      companyId: pendingCompanyId,
      title: 'Olmaz',
      sortOrder: 0,
    })

    expect(blocked.ok).toBe(false)
    if (blocked.ok) return
    expect(blocked.error.kind).toBe('PRECONDITION')
  }, 60_000)
})

describe('mayReadPrivate · the manufacturer half (task 8.1, carried from Phase 7)', () => {
  it('serves a project photo to a company with an ACCEPTED request, and to nobody with a PENDING one', async () => {
    /*
     * `14` §Access control, the semi-private class completed: "only for the customer and
     * manufacturers whose request is ACCEPTED+". The manufacturer half returned a flat
     * `false` until now — honest while OfferRequest did not exist, a gap once it did.
     */
    const prisma = getPrisma()

    const customer = await prisma.user.create({
      data: { email: `storage-project-customer-${companyId}@example.com` },
    })
    const customerActor = anonymousActor({ userId: customer.id, globalRole: 'CUSTOMER' })

    const category = await prisma.category.create({ data: { sortOrder: 93 } })
    const product = await prisma.product.create({
      data: { categoryId: category.id, basisType: 'AREA_M2' },
    })
    const project = await prisma.project.create({
      data: { customerId: customer.id, productId: product.id, status: 'SUBMITTED', quantity: 1 },
    })

    // The customer uploads a project photo directly (the wizard's attachment path).
    const file = await prisma.file.create({
      data: {
        key: `project/${project.id}/site.png`,
        bucket: 'test',
        mime: 'image/png',
        sizeBytes: 1024,
        ownerType: 'PROJECT',
        ownerId: project.id,
        uploadedBy: customer.id,
        virusScanStatus: 'CLEAN',
      },
    })

    const consent = await prisma.consent.create({
      data: {
        userId: customer.id,
        type: 'CONTACT_SHARING',
        textVersion: 'test.v1',
        ip: '203.0.113.90',
        userAgent: 'vitest',
      },
    })
    const request = await prisma.offerRequest.create({
      data: {
        projectId: project.id,
        customerId: customer.id,
        companyId,
        status: 'PENDING',
        slaExpiresAt: new Date(Date.now() + 48 * 3_600_000),
        consentId: consent.id,
      },
    })

    // PENDING: the manufacturer sees nothing — same boundary as the lead DTO.
    const beforeAccept = await fileUrl(ownerActor, { fileId: file.id })
    expect(beforeAccept.ok).toBe(false)
    if (!beforeAccept.ok) expect(beforeAccept.error.kind).toBe('FORBIDDEN')

    // The customer always could.
    const asCustomer = await fileUrl(customerActor, { fileId: file.id })
    expect(asCustomer.ok).toBe(true)
    if (asCustomer.ok) expect(asCustomer.value.accessClass).toBe('semi-private')

    await prisma.offerRequest.update({
      where: { id: request.id },
      data: { status: 'ACCEPTED', respondedAt: new Date(), contactDisclosedAt: new Date() },
    })

    const afterAccept = await fileUrl(ownerActor, { fileId: file.id })
    expect(afterAccept.ok).toBe(true)
    if (!afterAccept.ok) return
    expect(afterAccept.value.accessClass).toBe('semi-private')
    expect(afterAccept.value.expiresIn).toBe(15 * 60)

    // A DIFFERENT company with no request stays out.
    const denied = await fileUrl(outsiderActor, { fileId: file.id })
    expect(denied.ok).toBe(false)
  }, 60_000)
})
