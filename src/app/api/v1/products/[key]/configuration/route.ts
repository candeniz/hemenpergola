import { REFERENCE_CACHE, respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/products/{productId}/configuration?include=` — the product as the wizard
 * loads it: attributes, options, dependency hints (`06` §Catalogue's "drives the
 * configurator").
 *
 * Id-addressed where the sibling page read is slug-addressed — the id comes from the
 * products list or from the project being edited. `include` is a comma-separated list of
 * option ids that must render even if deactivated; ids rather than a `projectId`, for the
 * reason `getConfigurableProductSchema`'s own comment gives — this method is anonymous,
 * and a project id here would leak which options somebody else's project selected.
 *
 * Cached like the rest of the catalogue: deactivating an option is a catalogue change and
 * takes effect within the hour, same as it does on the ISR pages.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  const [
    { getConfigurableProductSchema, getConfigurableProduct },
    { resolveActor },
    { err, validation },
  ] = await Promise.all([
    import('@/modules/catalog/application/catalog-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const { key } = await params
  const include = new URL(request.url).searchParams.get('include')

  const parsed = getConfigurableProductSchema.safeParse({
    productId: key,
    ...(include === null || include === ''
      ? {}
      : { includeOptionIds: include.split(',').filter((id) => id !== '') }),
  })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(
    await getConfigurableProduct(await resolveActor(request), parsed.data),
    undefined,
    {
      cacheControl: REFERENCE_CACHE,
    },
  )
}
