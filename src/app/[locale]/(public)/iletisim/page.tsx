import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'

import { ContentPageBody, loadContentPage } from '@/components/content/content-page'
import { absoluteUrl, localePath } from '@/shared/seo/site-url'

/** CMS route 'iletisim' — task 8.3. Thin by design: the CMS is the page. */
export const revalidate = 900

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const page = await loadContentPage('iletisim', locale)
  return {
    ...(page === null ? {} : { title: page.title }),
    alternates: { canonical: absoluteUrl(localePath(locale, '/iletisim')) },
  }
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const page = await loadContentPage('iletisim', locale)
  return <ContentPageBody locale={locale} page={page} />
}
