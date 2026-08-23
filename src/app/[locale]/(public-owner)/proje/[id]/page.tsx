import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { PublicShell } from '@/components/layouts/public-shell'
import { ProjectWizard, type WizardAttribute } from '@/components/project/wizard'

/**
 * `/proje/[id]` — the configurator itself (`ADR-021`, tasks 4.1 to 4.4 and 4.7).
 *
 * **Public, and uncacheable.** The `(public-owner)` group layout sets `force-dynamic` for
 * everything in it; this page carries one customer's dimensions, location and notes, and
 * `07` §Rendering strategy explains why that is not a caching decision anybody may revisit
 * casually. Authorisation is the project's own ownership — `customerId` or `anonymousKey` in
 * the `where` clause — so a project belonging to somebody else is a 404 rather than a 403.
 *
 * The attribute rows are loaded **server-side and rendered from data** (`10` §What V1 builds,
 * `CAT-03`): adding a product or an option is a data change, not a deployment.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export default async function ProjectWizardPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)

  const [t, projectService, matching, { resolveActor }, { headers }] = await Promise.all([
    getTranslations('wizard'),
    import('@/modules/project/application/project-service'),
    import('@/modules/matching/application/service-area-service'),
    import('@/shared/context/actor'),
    import('next/headers'),
  ])

  const requestHeaders = await headers()
  const actor = await resolveActor({
    headers: { get: (name: string) => requestHeaders.get(name) },
  })

  const loaded = await projectService.getProject(actor, { projectId: id })
  if (!loaded.ok) notFound()

  const project = loaded.value

  // `getConfigurableProduct`, not `getProduct`: the latter is admin-only and returns inactive
  // options too. A public page calling it would render a form with no questions.
  const { getConfigurableProduct } = await import('@/modules/catalog/application/catalog-service')

  /*
   * The already-chosen option ids come with the read, so an option deactivated since this
   * draft was started still renders and stays selected (`10` §Admin authoring). Without them
   * the customer's answer silently disappears and readiness reports a question they cannot
   * see.
   */
  const product = await getConfigurableProduct(actor, {
    productId: project.productId,
    includeOptionIds: project.values
      .map((value) => value.optionId)
      .filter((optionId): optionId is string => optionId !== null),
  })

  const attributes: WizardAttribute[] =
    product.ok && product.value.product.attributes !== undefined
      ? product.value.product.attributes.map((attribute) => ({
          attributeId: attribute.id,
          key: attribute.key,
          // `labels` is the per-locale map the catalogue stores; fall back to the machine key
          // rather than to the other locale, so a missing translation is visible.
          label: attribute.labels[locale === 'en' ? 'en' : 'tr'] ?? attribute.key,
          inputType: attribute.inputType,
          isRequired: attribute.isRequired,
          showIfAttributeKey: attribute.showIfAttributeKey,
          showIfValue: attribute.showIfValue,
          options: (attribute.options ?? []).map((option) => ({
            optionId: option.id,
            value: option.value,
            label: option.labels[locale === 'en' ? 'en' : 'tr'] ?? option.value,
          })),
        }))
      : []

  const [cityResult, districtResult, { UPLOAD_POLICY }] = await Promise.all([
    matching.listCities(actor, { companyId: 'public' }),
    matching.listDistricts(actor, { companyId: 'public' }),
    /*
     * `14` §Limits, read on the server and handed to the client as three plain values.
     *
     * The wizard is a client component; importing the policy table there would put
     * `modules/media/domain` — and everything it references — into the browser bundle. Passing
     * the numbers keeps the *same* table authoritative on both sides, which is the property
     * that matters: the disabled button and `checkUpload` cannot disagree about what is
     * allowed because they are reading one source. The table is read through the application
     * layer, which re-exports it — app/ never reaches into a module's domain.
     */
    import('@/modules/media/application/file-service'),
  ])

  return (
    <PublicShell>
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-sm px-gutter py-lg">
        <h1 className="font-heading text-display-sm">{t('title')}</h1>
        <ProjectWizard
          project={project}
          attributes={attributes}
          cities={
            cityResult.ok
              ? cityResult.value.cities.map((city) => ({ id: city.cityId, name: city.name }))
              : []
          }
          districts={districtResult.ok ? districtResult.value.districts : []}
          signedIn={actor.userId !== null}
          uploadPolicy={{
            accept: UPLOAD_POLICY.PROJECT.mimeTypes.join(','),
            maxBytes: UPLOAD_POLICY.PROJECT.maxBytes,
            maxCount: UPLOAD_POLICY.PROJECT.maxCount,
          }}
        />
      </main>
    </PublicShell>
  )
}
