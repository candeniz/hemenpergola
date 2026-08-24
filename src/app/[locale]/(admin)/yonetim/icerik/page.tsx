import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { ContentEditor } from '@/components/admin/content-editor'
import { DashboardShell } from '@/components/layouts/dashboard-shell'
import { Card, CardTitle } from '@/components/ui/card'

/**
 * `/yonetim/icerik` — the CMS editor surface, task 8.3. One editor per (page, locale);
 * the page list is the closed `CONTENT_PAGE_KEYS`, so this surface cannot invent routes.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function ContentAdminPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const [t, contentService, { resolveActor }, { headers }] = await Promise.all([
    getTranslations({ locale, namespace: 'adminContent' }),
    import('@/modules/content/application/content-service'),
    import('@/shared/context/actor'),
    import('next/headers'),
  ])

  const requestHeaders = await headers()
  const actor = await resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    { locale },
  )

  if (actor.globalRole !== 'ADMIN') {
    return (
      <DashboardShell title={t('title')}>
        <p role="alert" className="text-body-md text-destructive">
          {t('forbidden')}
        </p>
      </DashboardShell>
    )
  }

  const editors = await Promise.all(
    contentService.CONTENT_PAGE_KEYS.flatMap((key) =>
      (['tr', 'en'] as const).map(async (pageLocale) => {
        const page = await contentService.getPublicContentPage(actor, {
          key,
          locale: pageLocale,
        })
        return {
          key,
          pageLocale,
          title: page.ok ? page.value.title : '',
          blocks: page.ok ? page.value.blocks : [],
        }
      }),
    ),
  )

  return (
    <DashboardShell title={t('title')}>
      <div className="flex flex-col gap-md">
        <h1 className="font-heading text-headline-md">{t('title')}</h1>
        <p className="max-w-2xl text-body-sm text-muted">{t('lead')}</p>

        <ul className="flex flex-col gap-base">
          {editors.map((editor) => {
            const editorLabel = `/${editor.key} · ${editor.pageLocale}`
            return (
              <li key={`${editor.key}-${editor.pageLocale}`}>
                <Card density="dense" className="flex flex-col gap-base">
                  <CardTitle>{editorLabel}</CardTitle>
                  <ContentEditor
                    pageKey={editor.key}
                    locale={editor.pageLocale}
                    initialTitle={editor.title}
                    initialBlocks={editor.blocks}
                  />
                </Card>
              </li>
            )
          })}
        </ul>
      </div>
    </DashboardShell>
  )
}
