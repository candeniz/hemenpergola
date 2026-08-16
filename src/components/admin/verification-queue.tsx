'use client'

import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import {
  getCompanyForVerificationAction,
  listVerificationQueueAction,
  rejectCompanyAction,
  requestDocumentsAction,
  reviewDocumentAction,
  suspendCompanyAction,
  verifyCompanyAction,
} from '@/app/actions/verification'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

import type { CompanyDetail, QueueEntry } from '@/modules/iam/application/verification-service'

/**
 * `super_admin_manufacturer_verification` and `_detail` — task 2.4.
 *
 * One component in two states rather than two pages, the same way `07` §Route map treats the
 * manufacturer request detail: the queue and the decision are one task, and a route change
 * between them loses the reviewer's place.
 *
 * The screen holds no rules. Rejection needs a reason because the *service* refuses without
 * one; the form marks it required so the refusal is rare, not so the refusal is unnecessary.
 */

type Outcome = { status: number } & (
  { data: unknown; meta: unknown } | { error: { code: string; message: string } }
)

const isError = (
  outcome: Outcome,
): outcome is { status: number } & { error: { code: string; message: string } } =>
  'error' in outcome

const STATUS_TONE = {
  PENDING: 'waiting',
  VERIFIED: 'progress',
  REJECTED: 'cancelled',
  SUSPENDED: 'cancelled',
} as const

const STATUS_KEY = {
  PENDING: 'statusPending',
  VERIFIED: 'statusVerified',
  REJECTED: 'statusRejected',
  SUSPENDED: 'statusSuspended',
} as const

const iso = (value: Date | string) => new Date(value).toISOString().slice(0, 10)

export function VerificationQueue({ companies: initial }: { companies: QueueEntry[] }) {
  const t = useTranslations('admin.verification')
  const [companies, setCompanies] = useState(initial)
  const [open, setOpen] = useState<CompanyDetail | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  const refresh = async (companyId?: string) => {
    const queue = (await listVerificationQueueAction({})) as Outcome
    if (!isError(queue) && 'data' in queue) {
      setCompanies((queue.data as { companies: QueueEntry[] }).companies)
    }
    if (companyId === undefined) return

    const detail = (await getCompanyForVerificationAction({ companyId })) as Outcome
    if (!isError(detail) && 'data' in detail) {
      setOpen((detail.data as { company: CompanyDetail }).company)
    }
  }

  const handle = (run: () => Promise<Outcome>, companyId: string) => {
    setProblem(null)
    setDone(false)
    start(async () => {
      const outcome = await run()
      if (isError(outcome)) {
        setProblem(outcome.error.message)
        return
      }
      setDone(true)
      await refresh(companyId)
    })
  }

  if (open !== null) {
    return (
      <CompanyDecision
        company={open}
        pending={pending}
        problem={problem}
        done={done}
        onBack={() => {
          setOpen(null)
          setProblem(null)
          setDone(false)
        }}
        onDecision={handle}
      />
    )
  }

  return (
    <div className="flex flex-col gap-md">
      {problem === null ? null : (
        <p role="alert" className="flex items-center gap-base text-body-sm text-destructive">
          <Icon name="error" dense />
          {problem}
        </p>
      )}

      {companies.length === 0 ? (
        <p className="text-body-md text-muted">{t('queueEmpty')}</p>
      ) : (
        <Card density="dense">
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('company')}</TableHead>
                  <TableHead>{t('taxNumber')}</TableHead>
                  <TableHead>{t('applied')}</TableHead>
                  <TableHead>{t('documents')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => (
                  <TableRow key={company.companyId}>
                    <TableCell>{company.displayName}</TableCell>
                    <TableCell className="font-mono text-body-sm">
                      {company.taxNumber ?? '—'}
                    </TableCell>
                    <TableCell>{iso(company.createdAt)}</TableCell>
                    <TableCell>
                      {t('pendingDocuments', { count: company.pendingDocumentCount })}
                    </TableCell>
                    <TableCell>
                      <Badge tone={STATUS_TONE[company.status]}>
                        {t(STATUS_KEY[company.status])}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="dense"
                        onClick={() => void refresh(company.companyId)}
                      >
                        {t('review')}
                        <Icon name="arrow_forward" dense />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function CompanyDecision({
  company,
  pending,
  problem,
  done,
  onBack,
  onDecision,
}: {
  company: CompanyDetail
  pending: boolean
  problem: string | null
  done: boolean
  onBack: () => void
  onDecision: (run: () => Promise<Outcome>, companyId: string) => void
}) {
  const t = useTranslations('admin.verification')
  const [reason, setReason] = useState('')
  const [documentNotes, setDocumentNotes] = useState<Record<string, string>>({})

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-center gap-md">
        <Button variant="ghost" size="dense" onClick={onBack}>
          <Icon name="arrow_back" dense />
          {t('back')}
        </Button>
        <span className="font-heading text-headline-md">{company.displayName}</span>
        <Badge tone={STATUS_TONE[company.status]}>{t(STATUS_KEY[company.status])}</Badge>
      </div>

      {problem === null ? null : (
        <p role="alert" className="flex items-center gap-base text-body-sm text-destructive">
          <Icon name="error" dense />
          {problem}
        </p>
      )}
      {done ? (
        <p role="status" className="flex items-center gap-base text-body-sm text-confirm">
          <Icon name="check_circle" dense />
          {t('done')}
        </p>
      ) : null}

      <Card density="dense">
        <CardHeader>
          <CardTitle>{t('company')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-xs text-body-sm">
          <p>
            <span className="text-muted">{t('legalName')}: </span>
            {company.legalName}
          </p>
          <p>
            <span className="text-muted">{t('taxNumber')}: </span>
            {company.taxNumber ?? '—'}
          </p>
          <p>
            <span className="text-muted">{t('members')}: </span>
            {company.members.map((member) => `${member.email} (${member.role})`).join(', ')}
          </p>
          {company.rejectionReason === null ? null : (
            <p>
              <span className="text-muted">{t('rejectionReason')}: </span>
              {company.rejectionReason}
            </p>
          )}
        </CardContent>
      </Card>

      <Card density="dense">
        <CardHeader>
          <CardTitle>{t('documents')}</CardTitle>
        </CardHeader>
        <CardContent>
          {company.documents.length === 0 ? (
            <p className="text-body-sm text-muted">{t('noDocuments')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('documentType')}</TableHead>
                  <TableHead>{t('documentStatus')}</TableHead>
                  <TableHead>{t('documentNote')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {company.documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell>{document.type}</TableCell>
                    <TableCell>
                      <Badge tone={document.status === 'APPROVED' ? 'progress' : 'waiting'}>
                        {document.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={t('documentNote')}
                        value={documentNotes[document.id] ?? document.note ?? ''}
                        onChange={(event) =>
                          setDocumentNotes((current) => ({
                            ...current,
                            [document.id]: event.target.value,
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell className="flex gap-base">
                      <Button
                        variant="outline"
                        size="dense"
                        disabled={pending}
                        onClick={() =>
                          onDecision(
                            () =>
                              reviewDocumentAction({
                                documentId: document.id,
                                status: 'APPROVED',
                                note: documentNotes[document.id],
                              }) as Promise<Outcome>,
                            company.companyId,
                          )
                        }
                      >
                        {t('approveDocument')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="dense"
                        disabled={pending}
                        onClick={() =>
                          onDecision(
                            () =>
                              reviewDocumentAction({
                                documentId: document.id,
                                status: 'REJECTED',
                                note: documentNotes[document.id],
                              }) as Promise<Outcome>,
                            company.companyId,
                          )
                        }
                      >
                        {t('rejectDocument')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card density="dense">
        <CardHeader>
          <CardTitle>{t('decision')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-md">
          <div className="flex flex-col gap-xs">
            <Label htmlFor="verification-reason">{t('reason')}</Label>
            <Textarea
              id="verification-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby="verification-reason-hint"
            />
            <p id="verification-reason-hint" className="text-body-sm text-muted">
              {t('reasonHint')}
            </p>
          </div>

          {/*
           * Approve is `confirm`, the three that constrain the company are not. The reason
           * field is empty for an approval and mandatory for everything else — the service
           * enforces that, and the hints below say which is which before the click.
           */}
          <div className="flex flex-wrap gap-base">
            <Button
              variant="confirm"
              size="dense"
              disabled={pending}
              onClick={() =>
                onDecision(
                  () =>
                    verifyCompanyAction({
                      companyId: company.companyId,
                      note: reason === '' ? undefined : reason,
                    }) as Promise<Outcome>,
                  company.companyId,
                )
              }
            >
              {pending ? t('working') : t('approve')}
            </Button>
            <Button
              variant="destructive"
              size="dense"
              disabled={pending}
              onClick={() =>
                onDecision(
                  () =>
                    rejectCompanyAction({
                      companyId: company.companyId,
                      reason,
                    }) as Promise<Outcome>,
                  company.companyId,
                )
              }
            >
              {t('reject')}
            </Button>
            <Button
              variant="outline"
              size="dense"
              disabled={pending}
              onClick={() =>
                onDecision(
                  () =>
                    requestDocumentsAction({
                      companyId: company.companyId,
                      reason,
                    }) as Promise<Outcome>,
                  company.companyId,
                )
              }
            >
              {t('requestDocuments')}
            </Button>
            <Button
              variant="ghost"
              size="dense"
              disabled={pending}
              onClick={() =>
                onDecision(
                  () =>
                    suspendCompanyAction({
                      companyId: company.companyId,
                      reason,
                    }) as Promise<Outcome>,
                  company.companyId,
                )
              }
            >
              {t('suspend')}
            </Button>
          </div>

          <ul className="flex flex-col gap-xs text-body-sm text-muted">
            <li>{t('approveHint')}</li>
            <li>{t('rejectHint')}</li>
            <li>{t('requestHint')}</li>
            <li>{t('suspendHint')}</li>
          </ul>
        </CardContent>
      </Card>

      <Card density="dense">
        <CardHeader>
          <CardTitle>{t('history')}</CardTitle>
        </CardHeader>
        <CardContent>
          {company.history.length === 0 ? (
            <p className="text-body-sm text-muted">{t('noHistory')}</p>
          ) : (
            <ol className="flex flex-col gap-sm">
              {company.history.map((entry, index) => (
                <li key={`${entry.action}-${index}`} className="flex flex-col gap-xs">
                  <p className="text-body-sm">
                    <span className="font-medium">{entry.action}</span>
                    <span className="text-muted"> · {iso(entry.createdAt)}</span>
                  </p>
                  {entry.reason === null ? null : (
                    <p className="text-body-sm text-muted">{entry.reason}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
