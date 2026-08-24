import { getTranslations } from 'next-intl/server'

import { JsonLd } from '@/components/seo/json-ld'
import { PublicShell } from '@/components/layouts/public-shell'
import { BlockRenderer } from '@/components/content/block-renderer'
import { absoluteUrl, localePath } from '@/shared/seo/site-url'

import type { ContentPageView } from '@/modules/content/application/content-service'

/** The shared body of the three CMS routes — one renderer, three thin pages. */
export async function ContentPageBody({
  locale,
  page,
}: {
  locale: string
  page: ContentPageView | null
}) {
  const t = await getTranslations({ locale, namespace: 'directory' })

  if (page === null) {
    return (
      <PublicShell>
        <p className="text-body-md text-muted">{t('loadError')}</p>
      </PublicShell>
    )
  }

  return (
    <PublicShell>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: page.title,
          dateModified: page.updatedAt.toISOString(),
          url: absoluteUrl(localePath(locale, `/${page.key}`)),
        }}
      />
      <div className="flex flex-col gap-md">
        <h1 className="font-heading text-headline-lg">{page.title}</h1>
        <BlockRenderer blocks={page.blocks} />
      </div>
    </PublicShell>
  )
}

export async function loadContentPage(
  key: string,
  locale: string,
): Promise<ContentPageView | null> {
  try {
    const { getPublicContentPage } = await import('@/modules/content/application/content-service')
    const { anonymousActor } = await import('@/shared/context/actor')
    const result = await getPublicContentPage(anonymousActor(), { key, locale })
    return result.ok ? result.value : null
  } catch {
    return null
  }
}
