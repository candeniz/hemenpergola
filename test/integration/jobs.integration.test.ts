import { beforeAll, describe, expect, it } from 'vitest'

import { runGeocodeServiceArea } from '@/modules/matching/infrastructure/geocode-job'
import { administrativeGeocoder, setGeocoder } from '@/modules/matching/infrastructure/geocoder'
import { runMediaProcess } from '@/modules/media/infrastructure/media-job'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ensureQueues, enqueue, JOB, startBoss, WORKED_QUEUES } from '@/shared/jobs'
import { getPoint, setPoint } from '@/shared/geo'
import { setStorage, type StorageProvider } from '@/shared/storage'

import { getPrisma } from './setup'

/**
 * The two Phase 3 jobs, and the property `23` §Runtime requires of all six of them:
 * **running one twice produces the same result as running it once**.
 *
 * That is not a nicety. A worker being replaced is drained, whatever is in flight is
 * returned to the queue, and the new instance runs it again from the start — so a job that
 * appends, increments or renames on each run corrupts its own output every time a deploy
 * lands mid-job. The failure is invisible in development, where nothing is ever replaced.
 */

/**
 * A real PNG, **rendered by `sharp` rather than pasted as base64**.
 *
 * The first version of this file hardcoded a base64 string that turned out not to be a valid
 * PNG at all, and the suite failed with `vipspng: libpng read error` from inside the job —
 * which reads as a bug in the pipeline rather than a bug in the fixture. Generating the
 * bytes with the same library that will decode them removes the whole class of problem.
 */
let PNG_400: Buffer

const objects = new Map<string, Uint8Array>()
let putCount = 0

const fakeStorage: StorageProvider = {
  name: 'fake',
  async presignUpload({ key }) {
    return { uploadUrl: `https://example.invalid/${key}`, key, expiresIn: 300 }
  },
  async readUrl(key) {
    return `https://cdn.example.invalid/${key}`
  },
  async getObject(key) {
    const object = objects.get(key)
    if (object === undefined) throw new Error(`no object at ${key}`)
    return object
  },
  async putObject({ key, body }) {
    putCount += 1
    objects.set(key, body)
  },
  async deleteObject(key) {
    objects.delete(key)
  },
}

let cityId = ''
let districtId = ''
let companyId = ''
let itemId = ''

beforeAll(async () => {
  setStorage(fakeStorage)
  setGeocoder(administrativeGeocoder)

  const sharp = (await import('sharp')).default
  // 400px wide, so the 320 `thumb` renders and the 640/1280/1920 variants are correctly
  // skipped rather than upscaled.
  PNG_400 = await sharp({
    create: { width: 400, height: 300, channels: 3, background: { r: 40, g: 80, b: 120 } },
  })
    .png()
    .toBuffer()

  const city = await getPrisma().city.create({ data: { name: 'Ankara', plateCode: 906 } })
  cityId = city.id
  await setPoint('City', cityId, { latitude: 39.9334, longitude: 32.8597 })

  const district = await getPrisma().district.create({ data: { cityId, name: 'Çankaya' } })
  districtId = district.id
  await setPoint('District', districtId, { latitude: 39.9, longitude: 32.85 })

  const company = await getPrisma().company.create({
    data: {
      slug: 'jobs-fixture',
      legalName: 'Jobs Fixture A.Ş.',
      displayName: 'Jobs Fixture',
      status: 'VERIFIED',
    },
  })
  companyId = company.id

  const item = await getPrisma().portfolioItem.create({
    data: { companyId, title: 'Kadıköy terasında bioklimatik pergola' },
  })
  itemId = item.id
}, 120_000)

describe('geo.geocode_service_area · idempotent', () => {
  it('produces the same centre on the second run', async () => {
    const area = await getPrisma().serviceArea.create({
      data: { companyId, kind: 'RADIUS', cityId, districtId, radiusKm: 30, isActive: true },
    })

    const first = await runGeocodeServiceArea(area.id)
    const afterFirst = await getPoint('ServiceArea', area.id)

    const second = await runGeocodeServiceArea(area.id)
    const afterSecond = await getPoint('ServiceArea', area.id)

    expect(first).toEqual(second)
    expect(afterFirst).not.toBeNull()
    expect(afterSecond).toEqual(afterFirst)
  }, 60_000)

  it('re-resolves after the district changes, rather than skipping because a centre exists', async () => {
    /*
     * The version that would look idempotent and is not: "skip if `centerPoint` is already
     * set". It passes the test above and silently ignores a manufacturer correcting their
     * district — which is the one case a re-run exists for.
     */
    const other = await getPrisma().district.create({ data: { cityId, name: 'Keçiören' } })
    await setPoint('District', other.id, { latitude: 40.0, longitude: 32.87 })

    const area = await getPrisma().serviceArea.create({
      data: { companyId, kind: 'RADIUS', cityId, districtId, radiusKm: 30, isActive: true },
    })
    await runGeocodeServiceArea(area.id)
    const before = await getPoint('ServiceArea', area.id)

    await getPrisma().serviceArea.update({
      where: { id: area.id },
      data: { districtId: other.id },
    })
    await runGeocodeServiceArea(area.id)
    const after = await getPoint('ServiceArea', area.id)

    expect(after).not.toEqual(before)
    expect(after?.latitude).toBeCloseTo(40.0, 3)
  }, 60_000)

  it('leaves the centre unset rather than guessing when nothing resolves', async () => {
    // A radius around the wrong point matches the wrong city quietly; a radius around
    // nothing matches nobody and gets noticed.
    const area = await getPrisma().serviceArea.create({
      data: { companyId, kind: 'RADIUS', radiusKm: 30, isActive: true },
    })

    const outcome = await runGeocodeServiceArea(area.id)

    expect(outcome.status).toBe('unresolvable')
    expect(await getPoint('ServiceArea', area.id)).toBeNull()
  }, 60_000)

  it('does nothing for a CITY or DISTRICT area', async () => {
    const area = await getPrisma().serviceArea.create({
      data: { companyId, kind: 'CITY', cityId, isActive: true },
    })

    expect((await runGeocodeServiceArea(area.id)).status).toBe('not-a-radius')
  }, 60_000)
})

describe('media.process · idempotent', () => {
  async function uploadedPhoto(): Promise<string> {
    const file = await getPrisma().file.create({
      data: {
        key: `public/portfolio/${itemId}/${Date.now()}.png`,
        bucket: 'test',
        mime: 'image/png',
        sizeBytes: PNG_400.byteLength,
        ownerType: 'PORTFOLIO',
        ownerId: itemId,
        virusScanStatus: 'PENDING',
      },
    })
    objects.set(file.key, new Uint8Array(PNG_400))
    return file.id
  }

  it('renders the same variant rows and keys on the second run', async () => {
    const fileId = await uploadedPhoto()

    const first = await runMediaProcess(fileId)
    const afterFirst = await getPrisma().fileVariant.findMany({
      where: { fileId },
      orderBy: { name: 'asc' },
    })

    const second = await runMediaProcess(fileId)
    const afterSecond = await getPrisma().fileVariant.findMany({
      where: { fileId },
      orderBy: { name: 'asc' },
    })

    expect(first).toEqual(second)

    // The rows are upserted on `(fileId, name)`, so the second run overwrites rather than
    // appends. A timestamped or randomised variant key would double this list.
    expect(afterSecond).toHaveLength(afterFirst.length)
    expect(afterSecond.map((variant) => variant.key)).toEqual(
      afterFirst.map((variant) => variant.key),
    )
    expect(afterSecond.map((variant) => variant.id)).toEqual(
      afterFirst.map((variant) => variant.id),
    )
  }, 120_000)

  it('writes the same object keys, so a retry overwrites rather than accumulates', async () => {
    const fileId = await uploadedPhoto()

    await runMediaProcess(fileId)
    const keysAfterFirst = [...objects.keys()].sort()

    await runMediaProcess(fileId)
    const keysAfterSecond = [...objects.keys()].sort()

    expect(keysAfterSecond).toEqual(keysAfterFirst)
  }, 120_000)

  it('records dimensions and marks the file servable', async () => {
    const fileId = await uploadedPhoto()
    await runMediaProcess(fileId)

    const file = await getPrisma().file.findUnique({ where: { id: fileId } })
    expect(file?.width).toBe(400)
    expect(file?.height).toBe(300)
    // `14` §Virus scanning gates serving on this; the scanner itself is an open question.
    expect(file?.virusScanStatus).toBe('CLEAN')
  }, 60_000)

  it('rejects a file whose bytes are not what it claimed', async () => {
    /*
     * `14` §Limits: *"MIME is determined from file content, not the extension and not the
     * client-supplied header. Mismatch → reject."* Presign has no bytes to sniff, so the
     * declared type is a promise and this job is where it is checked.
     */
    const file = await getPrisma().file.create({
      data: {
        key: `public/portfolio/${itemId}/liar-${Date.now()}.png`,
        bucket: 'test',
        mime: 'image/png',
        sizeBytes: 100,
        ownerType: 'PORTFOLIO',
        ownerId: itemId,
        virusScanStatus: 'PENDING',
      },
    })
    // A PDF wearing a .png key and an image/png declaration.
    objects.set(file.key, new Uint8Array(Buffer.from('%PDF-1.7\n%dummy\n', 'ascii')))

    const outcome = await runMediaProcess(file.id)

    expect(outcome).toEqual({ status: 'rejected', reason: 'mime-mismatch' })

    const after = await getPrisma().file.findUnique({ where: { id: file.id } })
    expect(after?.virusScanStatus).toBe('FAILED')
    // And the object is gone: bytes we did not agree to store do not stay in the bucket.
    expect(objects.has(file.key)).toBe(false)
  }, 60_000)

  it('does not render variants for a company document', async () => {
    // `14` §Image pipeline: originals are retained for company documents only, and a PDF has
    // no thumbnails.
    const company = await getPrisma().company.findUnique({ where: { id: companyId } })
    const file = await getPrisma().file.create({
      data: {
        key: `private/company_document/${company?.id}/${Date.now()}.pdf`,
        bucket: 'test',
        mime: 'application/pdf',
        sizeBytes: 20,
        ownerType: 'COMPANY_DOCUMENT',
        ownerId: company?.id ?? '',
        virusScanStatus: 'PENDING',
      },
    })
    objects.set(file.key, new Uint8Array(Buffer.from('%PDF-1.7\n%dummy\n', 'ascii')))

    const outcome = await runMediaProcess(file.id)

    expect(outcome).toEqual({ status: 'skipped', reason: 'not-an-image' })
    expect(await getPrisma().fileVariant.count({ where: { fileId: file.id } })).toBe(0)
    expect(objects.has(file.key)).toBe(true)
  }, 60_000)

  it('does not upscale a small image into a large variant', async () => {
    // A 400px source has no 1920px version; rendering one wastes storage to serve something
    // blurrier than the original.
    const fileId = await uploadedPhoto()
    await runMediaProcess(fileId)

    const variants = await getPrisma().fileVariant.findMany({ where: { fileId } })

    expect(variants.map((variant) => variant.name).sort()).toEqual(['thumb'])
    expect(variants.every((variant) => variant.width <= 400)).toBe(true)
  }, 60_000)
})

describe('pg-boss is really there', () => {
  it('starts, creates a queue and accepts a job', async () => {
    // The first background job in the product. Asserted against a real queue rather than a
    // mock, because "we called `enqueue`" is a claim about our own code and this is a claim
    // about pg-boss being installed, migrated and reachable.
    const boss = await startBoss()
    await ensureQueues()

    const jobId = await enqueue(JOB.geocodeServiceArea, { serviceAreaId: 'probe' })
    expect(jobId).not.toBeNull()

    const stored = jobId === null ? null : await boss.getJobById(JOB.geocodeServiceArea, jobId)
    expect(stored?.data).toEqual({ serviceAreaId: 'probe' })
  }, 120_000)

  it('deduplicates on a singleton key while one is queued', async () => {
    // The cheap half of idempotency: re-saving a service area five times enqueues one
    // geocode. The expensive half — the handler being safe to run twice — is above.
    // Through `ensureQueues`, because the queue *policy* is what makes `singletonKey` mean
    // anything — a queue created without it accepts duplicates silently, which is exactly
    // what this test caught the first time it ran.
    await ensureQueues()

    const first = await enqueue(JOB.mediaProcess, { fileId: 'dedupe' }, { singletonKey: 'k1' })
    const second = await enqueue(JOB.mediaProcess, { fileId: 'dedupe' }, { singletonKey: 'k1' })

    expect(first).not.toBeNull()
    expect(second).toBeNull()
  }, 120_000)

  it('keeps its tables out of the public schema', async () => {
    /*
     * `ADR-014`'s "one migration per phase" is about our schema. pg-boss migrates itself, so
     * letting it into `public` would put a dozen tables into `migration-1`'s exact table
     * list and make every pg-boss upgrade a change to our migration history.
     */
    await startBoss()

    const rows = await getPrisma().$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM pg_tables
      WHERE schemaname = 'public' AND tablename LIKE '%job%'
    `
    expect(Number(rows[0]?.count ?? 0)).toBe(0)

    const pgboss = await getPrisma().$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM pg_tables WHERE schemaname = 'pgboss'
    `
    expect(Number(pgboss[0]?.count ?? 0)).toBeGreaterThan(0)
  }, 120_000)

  it('has a queue for every handler the worker registers — no silent-drop enqueues', async () => {
    /*
     * The 7.1 finding: `enqueue()` never throws (a failed enqueue must not roll back the
     * write that triggered it), which means a `send` to a queue nobody created is *silent*.
     * Phase 6 shipped `offer_request.sla_expire` complete with handler and tests, and every
     * production enqueue of it was dropped because `ensureQueues` still ended at
     * `media.process`. Two assertions so it cannot recur:
     *
     *   1. every `boss.work(JOB.x)` in `worker.ts` names a queue in `WORKED_QUEUES`;
     *   2. an enqueue to each worked queue actually lands.
     */
    const workerSource = readFileSync(join(process.cwd(), 'src/worker.ts'), 'utf8')
    const workedInSource = [...workerSource.matchAll(/boss\.work<[^>]*>\(\s*JOB\.(\w+)/g)].map(
      (match) => JOB[match[1] as keyof typeof JOB],
    )
    expect(workedInSource.length).toBeGreaterThan(0)
    expect([...workedInSource].sort()).toEqual([...WORKED_QUEUES].sort())

    await ensureQueues()
    const slaJobId = await enqueue(
      JOB.slaExpire,
      { offerRequestId: 'probe-sla', kind: 'expire' },
      { singletonKey: 'probe-sla' },
    )
    expect(slaJobId).not.toBeNull()

    const probeUser = await getPrisma().user.create({
      data: { email: `queue-probe-${Date.now()}@example.com`, fullName: 'Queue Probe' },
    })
    const notification = await getPrisma().notification.create({
      data: { userId: probeUser.id, type: 'probe', payload: {} },
    })
    const dispatchJobId = await enqueue(JOB.notificationDispatch, {
      notificationId: notification.id,
    })
    expect(dispatchJobId).not.toBeNull()
  }, 120_000)
})

void putCount
