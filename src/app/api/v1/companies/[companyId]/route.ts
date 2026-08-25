import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/companies/{companyId}` — the company's own profile, and
 * `PATCH` — edit it (`06` §Manufacturer portal, `12`).
 *
 * The PATCH body splits across two service methods by field, because they are two
 * different risks: `updateCompanyProfile` covers identity fields (names, tax number,
 * about), `updateCompanyContact` the reachability fields (phone, address, coordinates —
 * `ADR-019`'s precision escape hatch). The route inspects which fields arrived and calls
 * the right one; a body mixing both is refused rather than half-applied, so a client
 * cannot send one request and get one silent partial success.
 *
 * `Company.slug` is deliberately not PATCHable here — it redirects the public URL and has
 * its own `PUT .../slug` with `18` §Slugs' redirect discipline behind it.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

const CONTACT_FIELDS = [
  'phone',
  'email',
  'website',
  'addressLine',
  'cityId',
  'districtId',
  'latitude',
  'longitude',
] as const

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<Response> {
  const [{ getCompanyProfile }, { resolveActor }] = await Promise.all([
    import('@/modules/iam/application/company-profile-service'),
    import('@/shared/context/actor'),
  ])

  const { companyId } = await params
  const actor = await resolveActor(request, { companyId })
  return respond(await getCompanyProfile(actor, { companyId }))
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<Response> {
  const [service, { resolveActor }, { err, validation }] = await Promise.all([
    import('@/modules/iam/application/company-profile-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const { companyId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const keys = Object.keys(body ?? {})
  const isContact = keys.some((key) => (CONTACT_FIELDS as readonly string[]).includes(key))
  const isProfile = keys.some((key) => !(CONTACT_FIELDS as readonly string[]).includes(key))

  if (isContact && isProfile) {
    return respond(
      err(
        validation([
          {
            code: 'custom',
            path: [],
            message: 'Profile fields and contact fields are separate writes — send two requests.',
          },
        ]),
      ),
    )
  }

  const actor = await resolveActor(request, { companyId })

  if (isContact) {
    const parsed = service.updateCompanyContactSchema.safeParse({ ...(body ?? {}), companyId })
    if (!parsed.success) return respond(err(validation(parsed.error.issues)))
    return respond(await service.updateCompanyContact(actor, parsed.data))
  }

  const parsed = service.updateCompanyProfileSchema.safeParse({ ...(body ?? {}), companyId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))
  return respond(await service.updateCompanyProfile(actor, parsed.data))
}
