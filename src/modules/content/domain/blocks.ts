import { z } from 'zod'

/**
 * The CMS block vocabulary — task 8.3, and the XSS decision is the file: **there is no
 * raw-HTML block, and the union is closed**, so one cannot be added quietly. Admin
 * content renders on public pages; the platform has no sanitizer (`19` §App security —
 * the same argument that rejects SVG uploads, Q19), and accepting HTML "to clean later"
 * is a standing hole in a repository where "later" never shipped. Structured blocks make
 * the sanitizer unnecessary: every string renders through React's escaping, the renderer
 * never touches `dangerouslySetInnerHTML` (a unit test scans for it), and the two
 * URL-bearing blocks constrain their URLs at the schema:
 *
 *   image.url  https only — no data:, no javascript:, no protocol-relative
 *   cta.href   site-relative only (`/...`) — a CTA cannot exfiltrate to another origin
 */

const text = z.string().trim().min(1).max(2000)

export const contentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), level: z.union([z.literal(2), z.literal(3)]), text }),
  z.object({ type: z.literal('paragraph'), text: z.string().trim().min(1).max(5000) }),
  z.object({ type: z.literal('list'), items: z.array(text).min(1).max(20) }),
  z.object({
    type: z.literal('image'),
    url: z
      .url()
      .refine((value) => value.startsWith('https://'), { message: 'image URLs must be https' }),
    alt: z.string().trim().min(1).max(300),
  }),
  z.object({
    type: z.literal('cta'),
    label: z.string().trim().min(1).max(100),
    href: z.string().regex(/^\/[a-zA-Z0-9\-/]*$/, 'CTA links are site-relative paths'),
  }),
])

export type ContentBlock = z.infer<typeof contentBlockSchema>

export const contentBlocksSchema = z.array(contentBlockSchema).min(1).max(50)

/** The route keys `07` §Route map gives the CMS. Closed — a new page is a deliberate edit. */
export const CONTENT_PAGE_KEYS = ['nasil-calisir', 'hakkimizda', 'iletisim'] as const
export type ContentPageKey = (typeof CONTENT_PAGE_KEYS)[number]
