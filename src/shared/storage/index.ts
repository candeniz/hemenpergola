import 'server-only'

import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { env } from '@/shared/config/env'

/**
 * The `StorageProvider` port and its S3-compatible adapter —
 * `05-system-architecture.md` §Ports, `14-file-storage-and-media.md`.
 *
 * Nothing is written to the application filesystem. `23` §Runtime runs the web tier as N
 * stateless instances, so a file on local disk is a file that exists on one of them.
 */

/**
 * The access class decides **where the object lives**, not just what a column says.
 *
 * `14` §Access control has three, and the difference has to survive a mistake: if the only
 * thing separating a company's tax certificate from a portfolio photo were a boolean on a
 * row, then one wrong `where` clause serves the tax certificate from the CDN. So the class
 * is in the **key prefix**, the prefix decides the URL policy, and a public object and a
 * private one cannot be confused by getting a query wrong.
 */
export type AccessClass = 'public' | 'semi-private' | 'private'

export const ACCESS_CLASS_PREFIX: Record<AccessClass, string> = {
  public: 'public/',
  'semi-private': 'protected/',
  private: 'private/',
}

/** `14` §Access control, in seconds. Private objects get the shortest life. */
export const SIGNED_URL_TTL: Record<AccessClass, number> = {
  public: 60 * 60 * 24,
  'semi-private': 15 * 60,
  private: 5 * 60,
}

export type PresignedUpload = {
  uploadUrl: string
  key: string
  /** Seconds. `14` §Upload flow fixes this at five minutes. */
  expiresIn: number
}

export type StorageProvider = {
  readonly name: string
  /**
   * A single-use upload URL, pinned to the content type and length the server has already
   * validated. `14`: *"The server validates **before** issuing the URL, not after the bytes
   * arrive."*
   */
  presignUpload(input: { key: string; mime: string; sizeBytes: number }): Promise<PresignedUpload>
  /** A read URL. Public objects get the CDN; everything else is signed. */
  readUrl(key: string, accessClass: AccessClass): Promise<string>
  getObject(key: string): Promise<Uint8Array>
  putObject(input: { key: string; body: Uint8Array; mime: string }): Promise<void>
  deleteObject(key: string): Promise<void>
}

/** The upload window. Five minutes (`14` §Upload flow). */
export const UPLOAD_URL_TTL_SECONDS = 5 * 60

function client(): S3Client {
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: 'us-east-1',
    // MinIO serves buckets as a path segment rather than a subdomain, and so does every
    // S3-compatible endpoint that is not AWS.
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  })
}

let provider: StorageProvider | undefined

export function getStorage(): StorageProvider {
  provider ??= s3Storage()
  return provider
}

/** Tests install a fake that records rather than uploads. */
export function setStorage(next: StorageProvider): void {
  provider = next
}

function s3Storage(): StorageProvider {
  const s3 = client()
  const bucket = env.S3_BUCKET

  return {
    name: 's3',

    async presignUpload({ key, mime, sizeBytes }) {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: mime,
        /*
         * Pinned to the declared length. Without it the URL is a blank cheque: the client
         * declared 2 MB, the server checked 2 MB against the quota, and then uploaded 2 GB.
         */
        ContentLength: sizeBytes,
      })

      return {
        uploadUrl: await getSignedUrl(s3, command, {
          expiresIn: UPLOAD_URL_TTL_SECONDS,
          signableHeaders: new Set(['content-type', 'content-length']),
        }),
        key,
        expiresIn: UPLOAD_URL_TTL_SECONDS,
      }
    },

    async readUrl(key, accessClass) {
      /*
       * Public objects are served from the CDN and never signed: a signed URL is
       * uncacheable by definition, and signing a portfolio photo would put every image
       * request through the application.
       *
       * Private objects are never CDN-cached (`14` §Access control), which is the other
       * half of the same sentence.
       */
      if (accessClass === 'public') {
        return new URL(key, `${env.CDN_BASE_URL.replace(/\/$/, '')}/`).toString()
      }

      return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: SIGNED_URL_TTL[accessClass],
      })
    },

    async getObject(key) {
      const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      const body = await result.Body?.transformToByteArray()
      if (body === undefined) throw new Error(`storage: ${key} has no body`)
      return body
    },

    async putObject({ key, body, mime }) {
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: mime }),
      )
    },

    async deleteObject(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    },
  }
}
