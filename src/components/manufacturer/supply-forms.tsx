'use client'

import Image from 'next/image'

import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import {
  attachDocumentAction,
  updateCompanyContactAction,
  updateCompanyProfileAction,
} from '@/app/actions/company-profile'
import { completeUploadAction, presignUploadAction } from '@/app/actions/files'
import {
  addServiceAreaAction,
  attachPhotoAction,
  createPortfolioItemAction,
  deletePortfolioItemAction,
  removeServiceAreaAction,
  setCompanyOptionsAction,
  setCompanyProductAction,
} from '@/app/actions/supply'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import type { CompanyProductView } from '@/modules/catalog/application/company-product-service'
import type { CompanyProfileView } from '@/modules/iam/application/company-profile-service'
import type { ServiceAreaView } from '@/modules/matching/application/service-area-service'
import type { PortfolioItemView } from '@/modules/portfolio/application/portfolio-service'

/**
 * The four manufacturer supply screens (`07` §Route map): company settings, product
 * management, service areas and portfolio.
 *
 * None of them holds a rule. The upload flow is the only thing with real logic on the
 * client, and it is logic the browser has to own: `14` §Upload flow sends the bytes
 * **straight to storage** rather than through the application, because `23` §Runtime keeps
 * the web tier stateless and a 10 MB body through a server action is the opposite of that.
 */

type Outcome = { status: number } & (
  { data: unknown; meta: unknown } | { error: { code: string; message: string } }
)

const isError = (
  outcome: Outcome,
): outcome is { status: number } & { error: { code: string; message: string } } =>
  'error' in outcome

/**
 * `Yarıçap (km): 40`, assembled outside JSX.
 *
 * `react/jsx-no-literals` rejects a template literal in JSX as firmly as a bare string, and
 * it is right to: the rule cannot tell a missed translation from an assembled one. The
 * label comes from next-intl, the number does not need translating, and the join happens
 * here.
 */
function radiusLabel(label: string, radiusKm: number | null): string {
  return `${label}: ${radiusKm ?? '—'}`
}

function Problem({ message }: { message: string | null }) {
  if (message === null) return null
  return (
    <p role="alert" className="flex items-start gap-base text-body-sm text-destructive">
      <Icon name="error" dense />
      {message}
    </p>
  )
}

function Field({
  id,
  label,
  hint,
  ...props
}: { id: string; label: string; hint?: string } & React.ComponentProps<'input'>) {
  return (
    <div className="flex flex-col gap-xs">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-describedby={hint === undefined ? undefined : `${id}-hint`} {...props} />
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-body-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  )
}

/**
 * Presign, PUT, complete — `14` §Upload flow, on the client because step two must not touch
 * the application.
 */
async function uploadFile(input: {
  ownerType: 'COMPANY_DOCUMENT' | 'PORTFOLIO'
  ownerId: string
  file: File
}): Promise<{ fileId: string } | { error: string }> {
  const presigned = (await presignUploadAction({
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    mime: input.file.type,
    sizeBytes: input.file.size,
  })) as Outcome

  if (isError(presigned)) return { error: presigned.error.message }
  if (!('data' in presigned)) return { error: 'no upload url' }

  const { fileId, uploadUrl } = presigned.data as { fileId: string; uploadUrl: string }

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: input.file,
    // The signature is pinned to both, so they are not optional.
    headers: { 'content-type': input.file.type, 'content-length': String(input.file.size) },
  })
  if (!response.ok) return { error: `storage returned ${response.status}` }

  await completeUploadAction({ fileId })
  return { fileId }
}

/* ── 3.1 · company settings ───────────────────────────────────────────────── */

export function CompanySettingsForm({ profile }: { profile: CompanyProfileView }) {
  const t = useTranslations('supply')
  const [pending, start] = useTransition()
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [values, setValues] = useState({
    displayName: profile.displayName,
    legalName: profile.legalName,
    taxNumber: profile.taxNumber ?? '',
    about: profile.about ?? '',
    phone: profile.contact?.phone ?? '',
    email: profile.contact?.email ?? '',
    website: profile.contact?.website ?? '',
    addressLine: profile.contact?.addressLine ?? '',
    latitude: profile.contact?.latitude?.toString() ?? '',
    longitude: profile.contact?.longitude?.toString() ?? '',
  })

  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }))

  return (
    <div className="flex flex-col gap-lg">
      <Card density="dense">
        <CardHeader>
          <CardTitle>{t('profile')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-md">
          <form
            className="grid gap-md md:grid-cols-2"
            action={() => {
              setProblem(null)
              setSaved(false)
              start(async () => {
                const profileOutcome = (await updateCompanyProfileAction({
                  companyId: profile.companyId,
                  displayName: values.displayName,
                  legalName: values.legalName,
                  ...(values.taxNumber === '' ? {} : { taxNumber: values.taxNumber }),
                  about: values.about,
                })) as Outcome

                if (isError(profileOutcome)) {
                  setProblem(profileOutcome.error.message)
                  return
                }

                const contactOutcome = (await updateCompanyContactAction({
                  companyId: profile.companyId,
                  phone: values.phone,
                  ...(values.email === '' ? {} : { email: values.email }),
                  ...(values.website === '' ? {} : { website: values.website }),
                  addressLine: values.addressLine,
                  ...(values.latitude === '' || values.longitude === ''
                    ? {}
                    : {
                        latitude: Number(values.latitude),
                        longitude: Number(values.longitude),
                      }),
                })) as Outcome

                if (isError(contactOutcome)) {
                  setProblem(contactOutcome.error.message)
                  return
                }
                setSaved(true)
              })
            }}
          >
            <Field
              id="displayName"
              label={t('displayName')}
              value={values.displayName}
              onChange={(event) => set('displayName')(event.target.value)}
              required
            />
            <Field
              id="legalName"
              label={t('legalName')}
              value={values.legalName}
              onChange={(event) => set('legalName')(event.target.value)}
              required
            />
            <Field
              id="taxNumber"
              label={t('taxNumber')}
              inputMode="numeric"
              value={values.taxNumber}
              onChange={(event) => set('taxNumber')(event.target.value)}
            />
            <Field
              id="phone"
              label={t('phone')}
              value={values.phone}
              onChange={(event) => set('phone')(event.target.value)}
            />
            <Field
              id="email"
              type="email"
              label={t('email')}
              value={values.email}
              onChange={(event) => set('email')(event.target.value)}
            />
            <Field
              id="website"
              label={t('website')}
              value={values.website}
              onChange={(event) => set('website')(event.target.value)}
            />
            <Field
              id="addressLine"
              label={t('addressLine')}
              value={values.addressLine}
              onChange={(event) => set('addressLine')(event.target.value)}
            />
            <div className="flex flex-col gap-xs">
              <Label htmlFor="about">{t('about')}</Label>
              <Textarea
                id="about"
                rows={4}
                value={values.about}
                onChange={(event) => set('about')(event.target.value)}
              />
            </div>

            {/*
             * Coordinates, not a map (`ADR-019`). The district centroid does the work for a
             * radius area; this is the precision escape hatch for a manufacturer who knows
             * where they are, and it needs no tile vendor.
             */}
            <Field
              id="latitude"
              label={t('latitude')}
              inputMode="decimal"
              hint={t('coordinatesHint')}
              value={values.latitude}
              onChange={(event) => set('latitude')(event.target.value)}
            />
            <Field
              id="longitude"
              label={t('longitude')}
              inputMode="decimal"
              value={values.longitude}
              onChange={(event) => set('longitude')(event.target.value)}
            />

            <div className="flex items-end gap-base md:col-span-2">
              <Button type="submit" variant="confirm" size="dense" disabled={pending}>
                {pending ? t('saving') : t('save')}
              </Button>
              {saved ? (
                <span
                  role="status"
                  className="flex items-center gap-base text-body-sm text-confirm"
                >
                  <Icon name="check_circle" dense />
                  {t('saved')}
                </span>
              ) : null}
            </div>
          </form>

          <Problem message={problem} />

          <p className="text-body-sm text-muted">
            {t('slug')}: <code>{profile.slug}</code>
            {profile.slugLocked ? ` · ${t('slugLocked')}` : ''}
          </p>
        </CardContent>
      </Card>

      <DocumentsCard profile={profile} />
    </div>
  )
}

function DocumentsCard({ profile }: { profile: CompanyProfileView }) {
  const t = useTranslations('supply')
  const [documents, setDocuments] = useState(profile.documents)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [type, setType] = useState('VERGI_LEVHASI')

  return (
    <Card density="dense">
      <CardHeader>
        <CardTitle>{t('documents')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-md">
        {documents.length === 0 ? (
          <p className="text-body-sm text-muted">{t('noDocuments')}</p>
        ) : (
          <ul className="flex flex-col gap-xs">
            {documents.map((document) => (
              <li key={document.id} className="flex items-center gap-base text-body-sm">
                <Badge tone={document.status === 'APPROVED' ? 'progress' : 'waiting'}>
                  {document.status}
                </Badge>
                {document.type}
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-md md:grid-cols-3">
          <Field
            id="documentType"
            label={t('documentType')}
            value={type}
            onChange={(event) => setType(event.target.value)}
          />
          <div className="flex flex-col gap-xs md:col-span-2">
            <Label htmlFor="documentFile">{t('uploadDocument')}</Label>
            <Input
              id="documentFile"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              disabled={busy}
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (file === undefined) return

                setProblem(null)
                setBusy(true)

                const uploaded = await uploadFile({
                  ownerType: 'COMPANY_DOCUMENT',
                  ownerId: profile.companyId,
                  file,
                })

                if ('error' in uploaded) {
                  setProblem(uploaded.error)
                  setBusy(false)
                  return
                }

                const attached = (await attachDocumentAction({
                  companyId: profile.companyId,
                  fileId: uploaded.fileId,
                  type,
                })) as Outcome

                if (isError(attached)) setProblem(attached.error.message)
                else {
                  setDocuments((current) => [
                    ...current,
                    {
                      id: (attached.data as { documentId: string }).documentId,
                      type,
                      status: 'PENDING',
                      note: null,
                      fileId: uploaded.fileId,
                      createdAt: new Date(),
                    },
                  ])
                }
                setBusy(false)
              }}
            />
          </div>
        </div>

        {busy ? <p className="text-body-sm text-muted">{t('uploading')}</p> : null}
        <Problem message={problem} />
      </CardContent>
    </Card>
  )
}

/* ── 3.2 · what we sell ───────────────────────────────────────────────────── */

export function ProductOfferForm({
  companyId,
  products,
}: {
  companyId: string
  products: CompanyProductView[]
}) {
  const t = useTranslations('supply')
  const [rows, setRows] = useState(products)
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (rows.length === 0) return <p className="text-body-md text-muted">{t('noProducts')}</p>

  return (
    <div className="flex flex-col gap-lg">
      <Problem message={problem} />

      {rows.map((product) => (
        <Card key={product.productId} density="dense">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-base">
              <Checkbox
                id={`offer-${product.productId}`}
                checked={product.isActive}
                disabled={pending}
                onCheckedChange={(value) => {
                  const isActive = value === true
                  setProblem(null)
                  start(async () => {
                    const outcome = (await setCompanyProductAction({
                      companyId,
                      productId: product.productId,
                      isActive,
                    })) as Outcome

                    if (isError(outcome)) {
                      setProblem(outcome.error.message)
                      return
                    }
                    setRows((current) =>
                      current.map((row) =>
                        row.productId === product.productId ? { ...row, isActive } : row,
                      ),
                    )
                  })
                }}
              />
              <Label htmlFor={`offer-${product.productId}`} className="normal-case text-body-lg">
                {product.name}
              </Label>
              <Badge tone="neutral">{product.basisType}</Badge>
            </CardTitle>
          </CardHeader>

          {product.isActive ? (
            <CardContent className="flex flex-col gap-md">
              {product.attributes
                .filter((attribute) => attribute.options.length > 0)
                .map((attribute) => (
                  <div key={attribute.attributeId} className="flex flex-col gap-xs">
                    <p className="text-label-md uppercase text-muted">
                      {attribute.label}
                      {attribute.isRequired ? ' *' : ''}
                    </p>
                    <div className="flex flex-wrap gap-md">
                      {attribute.options.map((option) => (
                        <label
                          key={option.optionId}
                          className="flex items-center gap-base text-body-sm"
                        >
                          <Checkbox
                            checked={option.isOffered === true}
                            disabled={pending}
                            onCheckedChange={(value) => {
                              const isOffered = value === true
                              setProblem(null)
                              start(async () => {
                                const outcome = (await setCompanyOptionsAction({
                                  companyId,
                                  productId: product.productId,
                                  options: [{ optionId: option.optionId, isOffered }],
                                })) as Outcome

                                if (isError(outcome)) {
                                  setProblem(outcome.error.message)
                                  return
                                }
                                setRows((current) =>
                                  current.map((row) =>
                                    row.productId !== product.productId
                                      ? row
                                      : {
                                          ...row,
                                          attributes: row.attributes.map((a) => ({
                                            ...a,
                                            options: a.options.map((o) =>
                                              o.optionId === option.optionId
                                                ? { ...o, isOffered }
                                                : o,
                                            ),
                                          })),
                                        },
                                  ),
                                )
                              })
                            }}
                          />
                          {option.label}
                          {/*
                           * "Not answered" is shown as its own state rather than as an
                           * unticked box. `09` treats a missing row as not offered, but the
                           * two are different facts and a manufacturer should see which one
                           * they have.
                           */}
                          {option.isOffered === null ? (
                            <Badge tone="neutral">{t('unanswered')}</Badge>
                          ) : null}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
            </CardContent>
          ) : null}
        </Card>
      ))}
    </div>
  )
}

/* ── 3.6 · where we work ──────────────────────────────────────────────────── */

export function ServiceAreaForm({
  companyId,
  areas: initial,
  cities,
  districts,
}: {
  companyId: string
  areas: ServiceAreaView[]
  cities: { id: string; name: string }[]
  districts: { id: string; cityId: string; name: string }[]
}) {
  const t = useTranslations('supply')
  const [areas, setAreas] = useState(initial)
  const [kind, setKind] = useState<'CITY' | 'DISTRICT' | 'RADIUS'>('CITY')
  const [cityId, setCityId] = useState(cities[0]?.id ?? '')
  const [districtId, setDistrictId] = useState('')
  const [radiusKm, setRadiusKm] = useState('30')
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const refresh = async () => {
    const { listServiceAreasAction } = await import('@/app/actions/supply')
    const next = (await listServiceAreasAction({ companyId })) as Outcome
    if (!isError(next) && 'data' in next) {
      setAreas((next.data as { areas: ServiceAreaView[] }).areas)
    }
  }

  const inCity = districts.filter((district) => district.cityId === cityId)

  return (
    <div className="flex flex-col gap-lg">
      <Problem message={problem} />

      {areas.length === 0 ? (
        <p className="text-body-md text-muted">{t('noAreas')}</p>
      ) : (
        <ul className="flex flex-col gap-xs">
          {areas.map((area) => (
            <li
              key={area.id}
              className="flex flex-wrap items-center gap-base rounded border border-divider p-sm text-body-sm"
            >
              <Badge tone="neutral">
                {t(`kind${area.kind.charAt(0)}${area.kind.slice(1).toLowerCase()}`)}
              </Badge>
              <span>{area.districtName ?? area.cityName ?? area.centerLabel ?? area.id}</span>
              {area.kind === 'RADIUS' ? (
                // The unit comes from the label rather than a bare literal, so a locale
                // that writes distance differently has somewhere to say so. The version that
                // broke this twice held a non-breaking space nobody could see in the diff.
                <span className="text-muted">{radiusLabel(t('radiusKm'), area.radiusKm)}</span>
              ) : null}
              {area.kind === 'RADIUS' && area.centre === null ? (
                // The geocode job has not run, or could not place it. Saying which is the
                // difference between "wait a moment" and "fix your input".
                <span className="text-muted">
                  {area.cityId === null && area.districtId === null
                    ? t('centreUnresolved')
                    : t('centrePending')}
                </span>
              ) : null}
              <Button
                variant="ghost"
                size="dense"
                className="ml-auto"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const outcome = (await removeServiceAreaAction({
                      companyId,
                      serviceAreaId: area.id,
                    })) as Outcome
                    if (isError(outcome)) setProblem(outcome.error.message)
                    else await refresh()
                  })
                }
              >
                {t('removeArea')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="grid gap-md md:grid-cols-5"
        action={() => {
          setProblem(null)
          start(async () => {
            const outcome = (await addServiceAreaAction({
              companyId,
              kind,
              ...(kind === 'CITY' || kind === 'RADIUS' ? { cityId } : {}),
              ...(kind === 'DISTRICT' || (kind === 'RADIUS' && districtId !== '')
                ? { districtId }
                : {}),
              ...(kind === 'RADIUS' ? { radiusKm: Number(radiusKm) } : {}),
            })) as Outcome

            if (isError(outcome)) setProblem(outcome.error.message)
            else await refresh()
          })
        }}
      >
        <div className="flex flex-col gap-xs">
          <Label htmlFor="area-kind">{t('kind')}</Label>
          <select
            id="area-kind"
            className="h-11 rounded border border-control-border bg-panel px-sm text-body-md text-on-panel sm:h-10"
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
          >
            <option value="CITY">{t('kindCity')}</option>
            <option value="DISTRICT">{t('kindDistrict')}</option>
            <option value="RADIUS">{t('kindRadius')}</option>
          </select>
        </div>

        <div className="flex flex-col gap-xs">
          <Label htmlFor="area-city">{t('city')}</Label>
          <select
            id="area-city"
            className="h-11 rounded border border-control-border bg-panel px-sm text-body-md text-on-panel sm:h-10"
            value={cityId}
            onChange={(event) => {
              setCityId(event.target.value)
              setDistrictId('')
            }}
          >
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-xs">
          <Label htmlFor="area-district">{t('district')}</Label>
          <select
            id="area-district"
            className="h-11 rounded border border-control-border bg-panel px-sm text-body-md text-on-panel sm:h-10"
            value={districtId}
            onChange={(event) => setDistrictId(event.target.value)}
            disabled={kind === 'CITY'}
          >
            <option value="">—</option>
            {inCity.map((district) => (
              <option key={district.id} value={district.id}>
                {district.name}
              </option>
            ))}
          </select>
        </div>

        <Field
          id="area-radius"
          label={t('radiusKm')}
          inputMode="numeric"
          value={radiusKm}
          onChange={(event) => setRadiusKm(event.target.value)}
          disabled={kind !== 'RADIUS'}
        />

        <div className="flex items-end">
          <Button type="submit" variant="confirm" size="dense" disabled={pending}>
            {pending ? t('saving') : t('addArea')}
          </Button>
        </div>
      </form>
    </div>
  )
}

/* ── 3.7 · what we have built ─────────────────────────────────────────────── */

export function PortfolioForm({
  companyId,
  items: initial,
}: {
  companyId: string
  items: PortfolioItemView[]
}) {
  const t = useTranslations('supply')
  const [items, setItems] = useState(initial)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const refresh = async () => {
    const { listPortfolioAction } = await import('@/app/actions/supply')
    const next = (await listPortfolioAction({ companyId })) as Outcome
    if (!isError(next) && 'data' in next) {
      setItems((next.data as { items: PortfolioItemView[] }).items)
    }
  }

  return (
    <div className="flex flex-col gap-lg">
      <Problem message={problem} />

      {items.length === 0 ? (
        <p className="text-body-md text-muted">{t('noItems')}</p>
      ) : (
        items.map((item) => (
          <Card key={item.itemId} density="dense">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-base">
                {item.title}
                <Badge tone="neutral">{t('photoCount', { count: item.photos.length })}</Badge>
                <Button
                  variant="ghost"
                  size="dense"
                  className="ml-auto"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const outcome = (await deletePortfolioItemAction({
                        companyId,
                        itemId: item.itemId,
                      })) as Outcome
                      if (isError(outcome)) setProblem(outcome.error.message)
                      else await refresh()
                    })
                  }
                >
                  {t('deleteItem')}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-md">
              <div className="flex flex-wrap gap-base">
                {item.photos.map((photo) => (
                  <div key={photo.photoId} className="flex flex-col gap-xs">
                    {photo.url === null ? (
                      // `14` §Virus scanning: nothing is served until `CLEAN`, so a photo
                      // still in the pipeline shows its state rather than a broken image.
                      <span className="text-body-sm text-muted">{t('photoProcessing')}</span>
                    ) : (
                      /*
                       * `next/image`, per `14` §Image pipeline. The allowed hosts are
                       * configured in `next.config.ts` from `CDN_BASE_URL` — that file is the
                       * build configuration rather than a route module, so non-negotiable 9
                       * does not reach it, and the host is a public name rather than a secret.
                       *
                       * `unoptimized` is not set: the variants `media.process` renders are the
                       * *stored* ladder, and the optimiser is what adapts them to the layout
                       * and the device. Both matter for `18` §Performance's budgets.
                       */
                      <Image
                        src={photo.variants[0]?.url ?? photo.url}
                        alt={item.title}
                        width={160}
                        height={120}
                        sizes="160px"
                        className="rounded border border-divider object-cover"
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-xs">
                <Label htmlFor={`photo-${item.itemId}`}>{t('addPhoto')}</Label>
                <Input
                  id={`photo-${item.itemId}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy === item.itemId}
                  onChange={async (event) => {
                    const file = event.target.files?.[0]
                    if (file === undefined) return

                    setProblem(null)
                    setBusy(item.itemId)

                    const uploaded = await uploadFile({
                      ownerType: 'PORTFOLIO',
                      ownerId: item.itemId,
                      file,
                    })

                    if ('error' in uploaded) {
                      setProblem(uploaded.error)
                      setBusy(null)
                      return
                    }

                    const attached = (await attachPhotoAction({
                      companyId,
                      itemId: item.itemId,
                      fileId: uploaded.fileId,
                      sortOrder: item.photos.length,
                    })) as Outcome

                    if (isError(attached)) setProblem(attached.error.message)
                    else await refresh()
                    setBusy(null)
                  }}
                />
                {busy === item.itemId ? (
                  <p className="text-body-sm text-muted">{t('uploading')}</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Card density="dense">
        <CardContent>
          <form
            className="grid gap-md md:grid-cols-3"
            action={() => {
              setProblem(null)
              start(async () => {
                const outcome = (await createPortfolioItemAction({
                  companyId,
                  title,
                  ...(description === '' ? {} : { description }),
                })) as Outcome

                if (isError(outcome)) {
                  setProblem(outcome.error.message)
                  return
                }
                setTitle('')
                setDescription('')
                await refresh()
              })
            }}
          >
            <Field
              id="item-title"
              label={t('itemTitle')}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
            <div className="flex flex-col gap-xs">
              <Label htmlFor="item-description">{t('itemDescription')}</Label>
              <Textarea
                id="item-description"
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" variant="confirm" size="dense" disabled={pending}>
                {pending ? t('saving') : t('addItem')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
