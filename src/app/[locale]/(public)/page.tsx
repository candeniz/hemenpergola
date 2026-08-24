import { getTranslations, setRequestLocale } from 'next-intl/server'

import { JsonLd } from '@/components/seo/json-ld'
import { PublicShell } from '@/components/layouts/public-shell'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Link } from '@/i18n/navigation'
import { absoluteUrl, localePath } from '@/shared/seo/site-url'

import type { PublicCategory } from '@/modules/directory/application/directory-service'

/**
 * Home. Layout and copy intent from `outdoor_systems_public_homepage_final`; the category
 * grid renders real catalogue rows (task 8.1), ISR-cached, with the build-time fallback
 * the other public pages use — `23` §Configuration keeps `next build` environment-free,
 * so the prerender carries the empty state and the first revalidation fills it.
 */
export const revalidate = 900

async function loadCategories(locale: string): Promise<PublicCategory[]> {
  try {
    const { listPublicCategories } =
      await import('@/modules/directory/application/directory-service')
    const { anonymousActor } = await import('@/shared/context/actor')
    const result = await listPublicCategories(anonymousActor(), { locale })
    return result.ok ? result.value : []
  } catch {
    return []
  }
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const [t, tDirectory, categories] = await Promise.all([
    getTranslations({ locale, namespace: 'home' }),
    getTranslations({ locale, namespace: 'directory' }),
    loadCategories(locale),
  ])

  return (
    <PublicShell>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'Hemen Pergola',
          url: absoluteUrl(localePath(locale, '/')),
        }}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'Hemen Pergola',
          url: absoluteUrl('/'),
        }}
      />
      <div className="flex flex-col gap-xl">
        <section className="flex flex-col gap-md">
          <h1 className="max-w-3xl font-heading text-headline-lg-mobile md:text-display-lg">
            {t('heroTitle')}
          </h1>
          <p className="max-w-2xl text-body-lg text-muted">{t('heroBody')}</p>
          <div>
            <Button asChild variant="confirm" size="touch">
              <Link href="/proje/yeni">
                {t('heroCta')}
                <Icon name="arrow_forward" dense />
              </Link>
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-md">
          <h2 className="font-heading text-headline-md">{t('categoriesTitle')}</h2>
          {categories.length === 0 ? (
            <p className="text-body-md text-muted">{tDirectory('categoriesEmpty')}</p>
          ) : (
            <ul className="grid gap-base sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <li key={category.slug}>
                  <Link href={`/kategoriler/${category.slug}`} className="block h-full">
                    <Card density="dense" className="flex h-full flex-col gap-xs">
                      <CardTitle>{category.name}</CardTitle>
                      {category.description !== null ? (
                        <p className="text-body-sm text-muted">{category.description}</p>
                      ) : null}
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PublicShell>
  )
}
