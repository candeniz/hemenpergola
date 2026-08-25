import 'server-only'

import {} from 'zod'

import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { prisma } from '@/shared/db'
import { err, notFound, ok, precondition } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

// The contract lives in ./dto (extracted in 11.2).
export {
  attachDocumentSchema,
  getCompanyProfileSchema,
  updateCompanyContactSchema,
  updateCompanyProfileSchema,
  updateCompanySlugSchema,
  type AttachDocumentInput,
  type CompanyProfileView,
  type GetCompanyProfileInput,
  type UpdateCompanyContactInput,
  type UpdateCompanyProfileInput,
  type UpdateCompanySlugInput,
} from './dto'
import type {
  AttachDocumentInput,
  CompanyProfileView,
  GetCompanyProfileInput,
  UpdateCompanyContactInput,
  UpdateCompanyProfileInput,
  UpdateCompanySlugInput,
} from './dto'

import { PERMISSIONS } from '../domain/permissions'

import { authorize } from './authorization'

/**
 * The company profile and its documents — task 3.1,
 * `manufacturer_company_settings`.
 *
 * `iam/` because this is the company aggregate: the same module owns creating the company,
 * its memberships and its verification, and the profile is the rest of that row. Splitting
 * "the company" across two modules to satisfy a screen boundary would mean two modules
 * writing `Company`.
 */

export const getCompanyProfile = serviceMethod<GetCompanyProfileInput, CompanyProfileView>(
  'company',
  'getCompanyProfile',
  { kind: 'permission', permission: PERMISSIONS.MEMBER_READ },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.MEMBER_READ)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { contact: true, documents: { orderBy: { createdAt: 'asc' } } },
    })
    if (company === null) return err(notFound('Company'))

    const { getPoint } = await import('@/shared/geo')
    const point = company.contact === null ? null : await getPoint('CompanyContact', companyId)

    return ok({
      companyId: company.id,
      slug: company.slug,
      // `04`: the slug is a public URL once the company is listed, and it is listed from
      // the moment it is verified.
      slugLocked: company.status === 'VERIFIED',
      displayName: company.displayName,
      legalName: company.legalName,
      taxNumber: company.taxNumber,
      about: company.about,
      foundedYear: company.foundedYear,
      employeeRange: company.employeeRange,
      status: company.status,
      contact:
        company.contact === null
          ? null
          : {
              phone: company.contact.phone,
              email: company.contact.email,
              website: company.contact.website,
              addressLine: company.contact.addressLine,
              cityId: company.contact.cityId,
              districtId: company.contact.districtId,
              latitude: point?.latitude ?? null,
              longitude: point?.longitude ?? null,
            },
      documents: company.documents.map((document) => ({
        id: document.id,
        type: document.type,
        status: document.status,
        note: document.note,
        fileId: document.fileId,
        createdAt: document.createdAt,
      })),
    })
  },
)

export const updateCompanyProfile = serviceMethod<UpdateCompanyProfileInput, { companyId: string }>(
  'company',
  'updateCompanyProfile',
  { kind: 'permission', permission: PERMISSIONS.COMPANY_UPDATE },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.COMPANY_UPDATE)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId
    const before = await prisma.company.findUnique({ where: { id: companyId } })
    if (before === null) return err(notFound('Company'))

    await prisma.company.update({
      where: { id: companyId },
      data: {
        ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
        ...(input.legalName === undefined ? {} : { legalName: input.legalName }),
        ...(input.taxNumber === undefined ? {} : { taxNumber: input.taxNumber }),
        ...(input.about === undefined ? {} : { about: input.about }),
        ...(input.foundedYear === undefined ? {} : { foundedYear: input.foundedYear }),
        ...(input.employeeRange === undefined ? {} : { employeeRange: input.employeeRange }),
      },
    })

    await recordAudit(actor, {
      action: 'company_profile_updated',
      entityType: 'Company',
      entityId: companyId,
      companyId,
      before: {
        displayName: before.displayName,
        legalName: before.legalName,
        taxNumber: before.taxNumber,
      },
      after: {
        displayName: input.displayName ?? before.displayName,
        legalName: input.legalName ?? before.legalName,
        taxNumber: input.taxNumber ?? before.taxNumber,
      },
    })

    return ok({ companyId })
  },
)

/**
 * Change the slug — **refused once the company is verified** (`04` §Catalogue conventions).
 *
 * A verified company is listed, so its slug is a public URL that is indexed and linked. `18`
 * §Canonical would need a redirect map to change one, and there is no redirect table until
 * Phase 8. Refusing is the honest V1 answer; the alternative is a silently broken URL.
 *
 * Separate from `updateCompanyProfile` so the refusal is a whole method rather than a
 * conditional buried in a patch — a field that is sometimes writable is the kind of thing a
 * later "update everything" endpoint quietly re-opens.
 */
export const updateCompanySlug = serviceMethod<UpdateCompanySlugInput, { slug: string }>(
  'company',
  'updateCompanySlug',
  { kind: 'permission', permission: PERMISSIONS.COMPANY_UPDATE },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.COMPANY_UPDATE)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId
    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (company === null) return err(notFound('Company'))

    if (company.status === 'VERIFIED') {
      return err(precondition('the address of a verified company cannot change; contact support'))
    }
    if (company.slug === input.slug) return ok({ slug: company.slug })

    const taken = await prisma.company.findUnique({ where: { slug: input.slug } })
    if (taken !== null) return err(precondition('that address is already taken'))

    await prisma.company.update({ where: { id: companyId }, data: { slug: input.slug } })

    await recordAudit(actor, {
      action: 'company_profile_updated',
      entityType: 'Company',
      entityId: companyId,
      companyId,
      before: { slug: company.slug },
      after: { slug: input.slug },
    })

    return ok({ slug: input.slug })
  },
)

export const updateCompanyContact = serviceMethod<UpdateCompanyContactInput, { companyId: string }>(
  'company',
  'updateCompanyContact',
  { kind: 'permission', permission: PERMISSIONS.COMPANY_UPDATE },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.COMPANY_UPDATE)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId
    if ((await prisma.company.findUnique({ where: { id: companyId } })) === null) {
      return err(notFound('Company'))
    }

    const data = {
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.website === undefined ? {} : { website: input.website }),
      ...(input.addressLine === undefined ? {} : { addressLine: input.addressLine }),
      ...(input.cityId === undefined ? {} : { cityId: input.cityId }),
      ...(input.districtId === undefined ? {} : { districtId: input.districtId }),
    }

    await prisma.companyContact.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: data,
    })

    /*
     * The point goes through `shared/geo` (`ADR-015`) — Prisma cannot see the column, and
     * this is the only file in `iam/` that touches a spatial value.
     *
     * Coordinates are optional and are the manufacturer's own (`ADR-019`). With none, the
     * district centroid does the work, which is what the geocoder resolves to anyway.
     */
    if (input.latitude !== undefined && input.longitude !== undefined) {
      const { setPoint } = await import('@/shared/geo')
      await setPoint('CompanyContact', companyId, {
        latitude: input.latitude,
        longitude: input.longitude,
      })
    }

    await recordAudit(actor, {
      action: 'company_profile_updated',
      entityType: 'CompanyContact',
      entityId: companyId,
      companyId,
      after: { ...data, hasPoint: input.latitude !== undefined },
    })

    return ok({ companyId })
  },
)

/**
 * Attach an uploaded file as a company document.
 *
 * `company:document.upload` is `onboarding` (`ADR-016`), so this works while the company is
 * `PENDING` — which is the whole point, since documents are what gets it verified — and
 * while it is `REJECTED`, which is what "may resubmit" means.
 */
export const attachDocument = serviceMethod<AttachDocumentInput, { documentId: string }>(
  'company',
  'attachDocument',
  { kind: 'permission', permission: PERMISSIONS.DOCUMENT_UPLOAD },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.DOCUMENT_UPLOAD)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId

    const file = await prisma.file.findUnique({ where: { id: input.fileId } })
    if (file === null) return err(notFound('File'))

    // The file must have been uploaded *for this company*, not merely be reachable by id.
    if (file.ownerType !== 'COMPANY_DOCUMENT' || file.ownerId !== companyId) {
      return err(precondition('that file was not uploaded as a document for this company'))
    }

    const document = await prisma.companyDocument.create({
      data: { companyId, fileId: input.fileId, type: input.type, status: 'PENDING' },
    })

    await recordAudit(actor, {
      action: 'company_profile_updated',
      entityType: 'CompanyDocument',
      entityId: document.id,
      companyId,
      after: { type: input.type, fileId: input.fileId },
    })

    return ok({ documentId: document.id })
  },
)

export const companyProfileService = {
  getCompanyProfile,
  updateCompanyProfile,
  updateCompanySlug,
  updateCompanyContact,
  attachDocument,
} satisfies Record<string, { meta: unknown }>
