import type { AccessClass } from '@/shared/storage'

/**
 * The upload limits of `14-file-storage-and-media.md` §Limits, as data.
 *
 * A table rather than a chain of `if`s in the service, and **in the service rather than in
 * the form**: `14` fixes a maximum size and a maximum count per owner, and a limit enforced
 * only by a disabled button is a limit that any `curl` ignores. The screen reads the same
 * table so the two cannot disagree about what is allowed.
 */

export type OwnerType =
  | 'PROJECT'
  | 'COMPANY_DOCUMENT'
  | 'PORTFOLIO'
  | 'COMPANY_LOGO'
  | 'COMPANY_COVER'
  | 'CMS'
  | 'OFFER_ATTACHMENT'

export type UploadPolicy = {
  mimeTypes: readonly string[]
  maxBytes: number
  /** How many files one owner row may hold. */
  maxCount: number
  accessClass: AccessClass
  /** Whether `media.process` should render variants. Documents keep their original only. */
  rendersVariants: boolean
  /** `14` §Image pipeline: originals are retained for company documents only. */
  keepsOriginal: boolean
}

const MB = 1024 * 1024

const IMAGE = ['image/jpeg', 'image/png', 'image/webp'] as const

export const UPLOAD_POLICY: Record<OwnerType, UploadPolicy> = {
  PROJECT: {
    mimeTypes: [...IMAGE, 'image/heic', 'application/pdf'],
    maxBytes: 10 * MB,
    maxCount: 10,
    // `14` §Access control: a customer's site photos are visible to the manufacturers whose
    // request has been accepted, and to nobody else.
    accessClass: 'semi-private',
    rendersVariants: true,
    keepsOriginal: false,
  },
  COMPANY_DOCUMENT: {
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    maxBytes: 20 * MB,
    maxCount: 20,
    // Legal identity documents. Signed for five minutes, owner company and admin only, and
    // never CDN-cached.
    accessClass: 'private',
    rendersVariants: false,
    keepsOriginal: true,
  },
  PORTFOLIO: {
    mimeTypes: IMAGE,
    maxBytes: 10 * MB,
    maxCount: 30,
    accessClass: 'public',
    rendersVariants: true,
    keepsOriginal: false,
  },
  COMPANY_LOGO: {
    // SVG is deliberately absent. `14` allows it *if* it is sanitised server-side, and no
    // sanitiser is built — an unsanitised SVG is a stored-XSS vector, so the honest V1
    // answer is to reject it rather than to accept it and hope. Noted in `25-progress.md`.
    mimeTypes: IMAGE,
    maxBytes: 2 * MB,
    maxCount: 1,
    accessClass: 'public',
    rendersVariants: true,
    keepsOriginal: false,
  },
  COMPANY_COVER: {
    mimeTypes: IMAGE,
    maxBytes: 2 * MB,
    maxCount: 1,
    accessClass: 'public',
    rendersVariants: true,
    keepsOriginal: false,
  },
  CMS: {
    mimeTypes: IMAGE,
    maxBytes: 10 * MB,
    maxCount: 100,
    accessClass: 'public',
    rendersVariants: true,
    keepsOriginal: false,
  },
  OFFER_ATTACHMENT: {
    mimeTypes: ['application/pdf'],
    maxBytes: 20 * MB,
    maxCount: 5,
    accessClass: 'private',
    rendersVariants: false,
    keepsOriginal: true,
  },
}

export type PolicyProblem =
  | { kind: 'mime-not-allowed'; mime: string; allowed: readonly string[] }
  | { kind: 'too-large'; sizeBytes: number; maxBytes: number }
  | { kind: 'too-many'; count: number; maxCount: number }

export function checkUpload(
  ownerType: OwnerType,
  input: { mime: string; sizeBytes: number; existingCount: number },
): PolicyProblem | null {
  const policy = UPLOAD_POLICY[ownerType]

  if (!policy.mimeTypes.includes(input.mime)) {
    return { kind: 'mime-not-allowed', mime: input.mime, allowed: policy.mimeTypes }
  }
  if (input.sizeBytes > policy.maxBytes) {
    return { kind: 'too-large', sizeBytes: input.sizeBytes, maxBytes: policy.maxBytes }
  }
  if (input.existingCount >= policy.maxCount) {
    return { kind: 'too-many', count: input.existingCount, maxCount: policy.maxCount }
  }

  return null
}

/**
 * The storage key.
 *
 * `<access-prefix><ownerType>/<ownerId>/<fileId>.<ext>` — the access class is the *first*
 * segment, so a bucket policy or a CDN rule can be written against a path prefix rather
 * than against application logic. That is the point of putting it in the key: an object in
 * `private/` cannot become public by a row changing.
 */
export function storageKey(input: {
  ownerType: OwnerType
  ownerId: string
  fileId: string
  mime: string
}): string {
  const prefix = ACCESS_PREFIX[UPLOAD_POLICY[input.ownerType].accessClass]
  return `${prefix}${input.ownerType.toLowerCase()}/${input.ownerId}/${input.fileId}.${extensionFor(input.mime)}`
}

/** A variant lives beside its original, under the same access prefix. */
export function variantKey(originalKey: string, variant: string, extension: string): string {
  return `${originalKey.replace(/\.[^./]+$/, '')}__${variant}.${extension}`
}

const ACCESS_PREFIX: Record<AccessClass, string> = {
  public: 'public/',
  'semi-private': 'protected/',
  private: 'private/',
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
}

export function extensionFor(mime: string): string {
  return EXTENSIONS[mime] ?? 'bin'
}

/** `14` §Image pipeline. WebP at four widths, plus one AVIF for the hero. */
export const IMAGE_VARIANTS = [
  { name: 'thumb', width: 320, mime: 'image/webp' },
  { name: 'card', width: 640, mime: 'image/webp' },
  { name: 'hero', width: 1280, mime: 'image/webp' },
  { name: 'full', width: 1920, mime: 'image/webp' },
  { name: 'hero-avif', width: 1280, mime: 'image/avif' },
] as const
