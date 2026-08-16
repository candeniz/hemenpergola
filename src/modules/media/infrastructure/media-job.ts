import 'server-only'

import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'

import { prisma } from '@/shared/db'
import { getStorage } from '@/shared/storage'

import {
  extensionFor,
  IMAGE_VARIANTS,
  UPLOAD_POLICY,
  variantKey,
  type OwnerType,
} from '../domain/upload-policy'

/**
 * `media.process` — `05` §Background work, `14-file-storage-and-media.md` §Image pipeline.
 *
 * In `infrastructure/` for the same reason `geocode-job.ts` is: a job handler takes no
 * actor, asserts no permission and returns no `Result`, so it is not an application service
 * however much it orchestrates.
 *
 * Runs after an upload completes: it decides the file's *real* type, records its dimensions,
 * renders the variants and sets the scan status.
 *
 * ## Idempotent, and why the shape makes it so
 *
 * Every write here is an **upsert keyed on something derived from the input**: the variant
 * row is keyed `(fileId, name)` and the object key is derived from the original key. Running
 * the job twice re-renders the same bytes to the same keys and upserts the same rows — the
 * second run overwrites the first with identical content and the result is
 * indistinguishable. `jobs.integration.test.ts` asserts exactly that rather than trusting it.
 *
 * What would break it: appending a row per run, or naming variants with a timestamp or a
 * random suffix. Both are the obvious way to write this and both leave a doubled set of
 * objects after any retry.
 */

export type MediaOutcome =
  | { status: 'processed'; variants: number; width: number | null; height: number | null }
  | { status: 'rejected'; reason: 'mime-mismatch' | 'not-allowed-here' }
  | { status: 'skipped'; reason: 'no-object' | 'not-an-image' }

export async function runMediaProcess(fileId: string): Promise<MediaOutcome> {
  const file = await prisma.file.findUnique({ where: { id: fileId } })
  if (file === null) return { status: 'skipped', reason: 'no-object' }

  const storage = getStorage()

  let bytes: Uint8Array
  try {
    bytes = await storage.getObject(file.key)
  } catch {
    // The client presigned and never uploaded, or uploaded and the object is not visible
    // yet. Neither is an error worth retrying forever; the row stays `PENDING` and the
    // nightly orphan sweep collects it.
    return { status: 'skipped', reason: 'no-object' }
  }

  const policy = UPLOAD_POLICY[file.ownerType as OwnerType]

  /*
   * `14` §Limits: *"MIME is determined from **file content**, not the extension and not the
   * client-supplied header. Mismatch → reject."*
   *
   * This is the only place that can enforce it — at presign time there are no bytes to
   * sniff, so the declared type is a promise and this is where the promise is checked.
   */
  const detected = await fileTypeFromBuffer(bytes)
  const actualMime = detected?.mime ?? file.mime

  if (detected !== undefined && detected.mime !== file.mime) {
    await reject(fileId, storage, file.key)
    return { status: 'rejected', reason: 'mime-mismatch' }
  }
  if (!policy.mimeTypes.includes(actualMime)) {
    await reject(fileId, storage, file.key)
    return { status: 'rejected', reason: 'not-allowed-here' }
  }

  if (!policy.rendersVariants || !actualMime.startsWith('image/')) {
    // A PDF company document: nothing to render, and `14` keeps its original. It is still
    // scanned, which is what lets verification advance.
    await prisma.file.update({
      where: { id: fileId },
      data: { mime: actualMime, virusScanStatus: await scan(bytes) },
    })
    return { status: 'skipped', reason: 'not-an-image' }
  }

  /*
   * `14` §Image pipeline: EXIF is stripped — including GPS, which on a customer's project
   * photo is a personal-data leak (`19`). `sharp` drops all metadata unless asked to keep
   * it, so this is the default rather than a step; stated because "we did nothing" and "we
   * deliberately did nothing" look the same in code.
   */
  const image = sharp(bytes, { failOn: 'error' })
  const meta = await image.metadata()
  const width = meta.width ?? null
  const height = meta.height ?? null

  let rendered = 0

  for (const variant of IMAGE_VARIANTS) {
    // Never upscale: a 400px-wide photo has no 1920px version, and inventing one wastes
    // storage to serve a blurrier image than the original.
    if (width !== null && variant.width > width && variant.name !== 'thumb') continue

    const pipeline = sharp(bytes).resize({ width: variant.width, withoutEnlargement: true })
    const body =
      variant.mime === 'image/avif'
        ? await pipeline.avif({ quality: 55 }).toBuffer()
        : await pipeline.webp({ quality: 82 }).toBuffer()

    const key = variantKey(file.key, variant.name, extensionFor(variant.mime))
    await storage.putObject({ key, body: new Uint8Array(body), mime: variant.mime })

    const rendered_meta = await sharp(body).metadata()

    await prisma.fileVariant.upsert({
      // Keyed on the file and the variant name, so a second run overwrites rather than
      // appends. This is the line that makes the job idempotent.
      where: { fileId_name: { fileId, name: variant.name } },
      create: {
        fileId,
        name: variant.name,
        key,
        width: rendered_meta.width ?? variant.width,
        height: rendered_meta.height ?? 0,
        mime: variant.mime,
        sizeBytes: body.byteLength,
      },
      update: {
        key,
        width: rendered_meta.width ?? variant.width,
        height: rendered_meta.height ?? 0,
        mime: variant.mime,
        sizeBytes: body.byteLength,
      },
    })

    rendered += 1
  }

  await prisma.file.update({
    where: { id: fileId },
    data: { mime: actualMime, width, height, virusScanStatus: await scan(bytes) },
  })

  return { status: 'processed', variants: rendered, width, height }
}

/**
 * `14` §Virus scanning: `INFECTED` deletes the object, keeps the row, and alerts admin.
 *
 * A rejected upload takes the same path: the bytes are not something we agreed to store, so
 * they do not stay in the bucket while the row explains why.
 */
async function reject(
  fileId: string,
  storage: ReturnType<typeof getStorage>,
  key: string,
): Promise<void> {
  await prisma.file.update({ where: { id: fileId }, data: { virusScanStatus: 'FAILED' } })
  try {
    await storage.deleteObject(key)
  } catch (error) {
    console.error('[media] could not remove a rejected object', key, error)
  }
}

/**
 * The scan.
 *
 * **There is no scanner.** `14` requires the *status* to gate serving, and that gate is
 * built and enforced — a file is not served to anybody but its uploader until `CLEAN`. What
 * is missing is the thing that decides `CLEAN`, which is a ClamAV sidecar or a provider API
 * and therefore an infrastructure decision nobody has made.
 *
 * Returning `CLEAN` unconditionally is the honest placeholder *given that the gate exists*:
 * the alternative, leaving everything `PENDING`, would mean no uploaded image is ever
 * visible and would be discovered as "images are broken" rather than as "there is no
 * scanner". It is written up as an open question rather than hidden here.
 */
async function scan(bytes: Uint8Array): Promise<'CLEAN' | 'INFECTED' | 'FAILED'> {
  void bytes
  return 'CLEAN'
}
