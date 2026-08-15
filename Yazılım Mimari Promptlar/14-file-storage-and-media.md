# 14 — File Storage & Media

## Model

All uploads are `File` rows plus objects in S3-compatible storage behind the
`StorageProvider` port (`05-system-architecture.md`). Nothing is stored on the application
filesystem — the app must stay stateless and horizontally scalable.

```
File(id, key, bucket, mime, sizeBytes, width?, height?, ownerType, ownerId,
     uploadedBy, virusScanStatus, createdAt)
```

`ownerType` ∈ `PROJECT | COMPANY_DOCUMENT | PORTFOLIO | COMPANY_LOGO | COMPANY_COVER |
CMS | OFFER_ATTACHMENT`. A file is always owned; orphans are swept nightly.

## Upload flow

```
client ──► POST /files/presign { ownerType, mime, sizeBytes }
       ◄── { uploadUrl, fileId }         (server validates type/size/quota first)
client ──► PUT uploadUrl  (direct to storage)
client ──► POST /files/{id}/complete
       ──► media.process job: dimensions, variants, scan
```

Presigned URLs are single-use, 5 minutes, and pinned to the declared content-type and length.
The server validates **before** issuing the URL, not after the bytes arrive.

## Limits

| Owner | Types | Max size | Max count |
|---|---|---|---|
| Project attachment | jpeg, png, webp, heic, pdf | 10 MB | 10 |
| Company document | pdf, jpeg, png | 20 MB | 20 |
| Portfolio photo | jpeg, png, webp | 10 MB | 30 per item |
| Logo / cover | jpeg, png, webp, svg¹ | 2 MB | 1 each |
| Offer attachment | pdf | 20 MB | 5 |

¹ SVG is sanitised server-side (strip scripts, external refs) or rejected. An unsanitised SVG
is a stored-XSS vector.

MIME is determined from **file content**, not the extension and not the client-supplied
header. Mismatch → reject.

## Image pipeline

`media.process` generates `thumb 320w`, `card 640w`, `hero 1280w`, `full 1920w` as WebP,
plus one AVIF for hero. EXIF is stripped — including GPS, which on customer project photos
is a personal-data leak (`19-security-and-kvkk.md`). Originals are retained for company
documents only.

Serving: `next/image` with a remote pattern for the storage/CDN host, `sizes` set per pattern
component, `priority` only on the hero. The Stitch screens use expiring
`googleusercontent` URLs; **none of those URLs ship** — every image is either a seeded asset
or an upload (`07-frontend-architecture.md`).

## Access control

| Class | Access |
|---|---|
| Public (portfolio, logo, CMS, category) | public bucket path, CDN-cached, long TTL |
| Semi-private (project photos) | signed URL, 15 min, only for the customer and manufacturers whose request is `ACCEPTED`+ |
| Private (company documents, offer PDFs) | signed URL, 5 min, owner company + admin only |

Signed-URL issuance for private classes goes through the application service and is
audit-logged for company documents. Private objects are never CDN-cached.

## Virus scanning

`virusScanStatus` ∈ `PENDING | CLEAN | INFECTED | FAILED`. Files are not served to anyone but
the uploader until `CLEAN`. `INFECTED` deletes the object, keeps the row, and alerts admin.
Company documents in `PENDING` cannot advance verification.

## Retention and deletion

- Deleting the owner (project, portfolio item) marks files for deletion; a nightly job
  removes objects after a 7-day grace period.
- Account deletion under KVKK removes personal-data files immediately, except company
  documents required for legal record, which are retained per
  `19-security-and-kvkk.md` §Retention with the personal fields redacted.
- Every deletion is audit-logged. Storage objects are never deleted without a corresponding
  `File` row transition — that is how orphan sweeps stay safe to run.
