'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

import { upsertContentPageAction } from '@/app/actions/content'
import { Button } from '@/components/ui/button'

import type { ContentBlock } from '@/modules/content/domain/blocks'

/**
 * The block editor — task 8.3, screen intent from `18` §Editor ("structured blocks, not
 * a rich-text field"). The palette IS the block union: there is no raw-HTML choice to
 * offer, which is the whole security design. Kept deliberately plain — five block types,
 * add/remove/reorder-by-position — because the launch pages need an editor, not a CMS
 * product.
 */

type EditorBlock = ContentBlock

const EMPTY: Record<ContentBlock['type'], EditorBlock> = {
  heading: { type: 'heading', level: 2, text: '' },
  paragraph: { type: 'paragraph', text: '' },
  list: { type: 'list', items: [''] },
  image: { type: 'image', url: '', alt: '' },
  cta: { type: 'cta', label: '', href: '/' },
}

export function ContentEditor({
  pageKey,
  locale,
  initialTitle,
  initialBlocks,
}: {
  pageKey: string
  locale: 'tr' | 'en'
  initialTitle: string
  initialBlocks: ContentBlock[]
}) {
  const t = useTranslations('adminContent')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [title, setTitle] = useState(initialTitle)
  const [blocks, setBlocks] = useState<EditorBlock[]>(initialBlocks)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateBlock(index: number, next: EditorBlock) {
    setBlocks((existing) => existing.map((block, i) => (i === index ? next : block)))
  }

  function save() {
    start(async () => {
      setError(null)
      setSaved(false)
      const result = (await upsertContentPageAction({
        key: pageKey,
        locale,
        title: title.trim(),
        blocks,
      })) as { data: unknown } | { error: { message: string } }
      if ('error' in result) {
        setError(result.error.message)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  const inputClass = 'rounded-md border border-control-border bg-panel p-base text-body-sm'

  return (
    <div className="flex flex-col gap-base">
      <label className="flex flex-col gap-xs text-body-sm">
        {t('titleLabel')}
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      </label>

      <ol className="flex flex-col gap-base">
        {blocks.map((block, index) => (
          <li
            key={index}
            className="flex flex-col gap-xs rounded-md border border-control-border p-base"
          >
            <div className="flex items-center justify-between gap-base">
              <p className="text-label-md uppercase text-muted">{t(`blockType.${block.type}`)}</p>
              <Button
                variant="outline"
                onClick={() => setBlocks((existing) => existing.filter((_, i) => i !== index))}
              >
                {t('removeBlock')}
              </Button>
            </div>

            {block.type === 'heading' ? (
              <input
                value={block.text}
                onChange={(e) => updateBlock(index, { ...block, text: e.target.value })}
                className={inputClass}
              />
            ) : null}
            {block.type === 'paragraph' ? (
              <textarea
                value={block.text}
                rows={4}
                onChange={(e) => updateBlock(index, { ...block, text: e.target.value })}
                className={inputClass}
              />
            ) : null}
            {block.type === 'list' ? (
              <textarea
                value={block.items.join('\n')}
                rows={4}
                onChange={(e) =>
                  updateBlock(index, {
                    ...block,
                    items: e.target.value.split('\n').filter((line) => line.trim() !== ''),
                  })
                }
                className={inputClass}
              />
            ) : null}
            {block.type === 'image' ? (
              <div className="flex flex-col gap-xs">
                <input
                  value={block.url}
                  placeholder="https://…"
                  onChange={(e) => updateBlock(index, { ...block, url: e.target.value })}
                  className={inputClass}
                />
                <input
                  value={block.alt}
                  placeholder={t('imageAlt')}
                  onChange={(e) => updateBlock(index, { ...block, alt: e.target.value })}
                  className={inputClass}
                />
              </div>
            ) : null}
            {block.type === 'cta' ? (
              <div className="flex flex-col gap-xs">
                <input
                  value={block.label}
                  placeholder={t('ctaLabel')}
                  onChange={(e) => updateBlock(index, { ...block, label: e.target.value })}
                  className={inputClass}
                />
                <input
                  value={block.href}
                  placeholder="/proje/yeni"
                  onChange={(e) => updateBlock(index, { ...block, href: e.target.value })}
                  className={inputClass}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-base">
        {(Object.keys(EMPTY) as ContentBlock['type'][]).map((type) => (
          <Button
            key={type}
            variant="outline"
            onClick={() => setBlocks((existing) => [...existing, EMPTY[type]])}
          >
            {t('addBlock', { type: t(`blockType.${type}`) })}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-base">
        <Button variant="confirm" disabled={pending || title.trim() === ''} onClick={save}>
          {t('save')}
        </Button>
        {saved ? (
          <p role="status" className="text-body-sm">
            {t('saved')}
          </p>
        ) : null}
        {error !== null ? (
          <p role="alert" className="text-body-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
