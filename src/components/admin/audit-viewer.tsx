'use client'

import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { listAuditEntriesAction } from '@/app/actions/audit'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type { AuditEntryView } from '@/modules/audit/application/audit-service'

/**
 * `super_admin_audit_logs` — task 2.5.
 *
 * Rendered as the `TimelineItem` pattern from `22` §Patterns rather than a table: an audit
 * log is read in time order, and the thing a reader wants from a row is *what changed*, not
 * eleven columns of which nine are the same on every row.
 *
 * The diff is computed in the service (`diffPayloads`), so this component renders changed
 * fields and never a JSON blob. `17` asks for an audit log; a raw dump of `before` and
 * `after` next to each other is a data export, and nobody reads one.
 */

type Outcome = { status: number } & (
  { data: unknown; meta: unknown } | { error: { code: string; message: string } }
)

const isError = (
  outcome: Outcome,
): outcome is { status: number } & { error: { code: string; message: string } } =>
  'error' in outcome

type Filters = {
  entityType: string
  entityId: string
  actorUserId: string
  action: string
  from: string
  to: string
}

const EMPTY: Filters = {
  entityType: '',
  entityId: '',
  actorUserId: '',
  action: '',
  from: '',
  to: '',
}

export function AuditViewer({
  entries: initialEntries,
  nextCursor: initialCursor,
  actions,
  entityTypes,
}: {
  entries: AuditEntryView[]
  nextCursor: string | null
  actions: string[]
  entityTypes: string[]
}) {
  const t = useTranslations('admin.audit')
  const [entries, setEntries] = useState(initialEntries)
  const [cursor, setCursor] = useState(initialCursor)
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const query = (nextCursor?: string) => ({
    ...(filters.entityType === '' ? {} : { entityType: filters.entityType }),
    ...(filters.entityId === '' ? {} : { entityId: filters.entityId }),
    ...(filters.actorUserId === '' ? {} : { actorUserId: filters.actorUserId }),
    ...(filters.action === '' ? {} : { action: filters.action }),
    ...(filters.from === '' ? {} : { from: `${filters.from}T00:00:00.000Z` }),
    ...(filters.to === '' ? {} : { to: `${filters.to}T23:59:59.999Z` }),
    ...(nextCursor === undefined ? {} : { cursor: nextCursor }),
  })

  const load = (append: boolean) => {
    setProblem(null)
    start(async () => {
      const outcome = (await listAuditEntriesAction(
        query(append ? (cursor ?? undefined) : undefined),
      )) as Outcome

      if (isError(outcome)) {
        /*
         * The one refusal a reader will meet: an entity id with no entity type. The service
         * says so because the index is `(entityType, entityId, createdAt)` and an id alone
         * is a sequential scan over the fastest-growing table in the system.
         */
        setProblem(
          outcome.error.code === 'VALIDATION' ? t('entityIdNeedsType') : outcome.error.message,
        )
        return
      }
      if (!('data' in outcome)) return

      const page = outcome.data as { entries: AuditEntryView[]; nextCursor: string | null }
      setEntries((current) => (append ? [...current, ...page.entries] : page.entries))
      setCursor(page.nextCursor)
    })
  }

  const set = (key: keyof Filters) => (value: string) =>
    setFilters((current) => ({ ...current, [key]: value }))

  return (
    <div className="flex flex-col gap-lg">
      <Card density="dense">
        <CardContent>
          <form className="grid gap-md md:grid-cols-3 lg:grid-cols-6" action={() => load(false)}>
            <Choice
              id="audit-entity-type"
              label={t('entityType')}
              value={filters.entityType}
              onChange={set('entityType')}
              options={entityTypes}
              allLabel={t('all')}
            />
            <Field
              id="audit-entity-id"
              label={t('entityId')}
              value={filters.entityId}
              onChange={set('entityId')}
            />
            <Field
              id="audit-actor"
              label={t('actor')}
              value={filters.actorUserId}
              onChange={set('actorUserId')}
            />
            <Choice
              id="audit-action"
              label={t('action')}
              value={filters.action}
              onChange={set('action')}
              options={actions}
              allLabel={t('all')}
            />
            <Field
              id="audit-from"
              label={t('from')}
              type="date"
              value={filters.from}
              onChange={set('from')}
            />
            <Field
              id="audit-to"
              label={t('to')}
              type="date"
              value={filters.to}
              onChange={set('to')}
            />

            <div className="flex items-end gap-base md:col-span-2">
              <Button type="submit" variant="primary" size="dense" disabled={pending}>
                {pending ? t('loading') : t('apply')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="dense"
                disabled={pending}
                onClick={() => {
                  setFilters(EMPTY)
                  setProblem(null)
                }}
              >
                {t('clear')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {problem === null ? null : (
        <p role="alert" className="flex items-center gap-base text-body-sm text-destructive">
          <Icon name="error" dense />
          {problem}
        </p>
      )}

      {entries.length === 0 ? (
        <p className="text-body-md text-muted">{t('empty')}</p>
      ) : (
        <ol className="flex flex-col gap-md">
          {entries.map((entry) => (
            <TimelineItem key={entry.id} entry={entry} />
          ))}
        </ol>
      )}

      {cursor === null ? null : (
        <div>
          <Button variant="outline" size="dense" disabled={pending} onClick={() => load(true)}>
            {pending ? t('loading') : t('loadMore')}
          </Button>
        </div>
      )}
    </div>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <div className="flex flex-col gap-xs">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

function Choice({
  id,
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  allLabel: string
}) {
  return (
    <div className="flex flex-col gap-xs">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="h-11 rounded border border-control-border bg-panel px-sm text-body-md text-on-panel sm:h-10"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * `before → after`, built outside JSX.
 *
 * `react/jsx-no-literals` is right that a bare string in a component is usually a missed
 * translation. An arrow between two values is punctuation, and the em dash stands for a
 * field that was absent — neither is language.
 */
function describe(change: AuditEntryView['changes'][number]): string {
  return `${change.before ?? '—'} → ${change.after ?? '—'}`
}

/** `22` §Patterns — `TimelineItem`. One entry, its diff, and the context it happened in. */
function TimelineItem({ entry }: { entry: AuditEntryView }) {
  const t = useTranslations('admin.audit')

  return (
    <li>
      <Card density="dense">
        <CardContent className="flex flex-col gap-sm">
          <div className="flex flex-wrap items-baseline gap-base">
            <Badge tone="neutral">{entry.action}</Badge>
            <span className="text-body-sm text-muted">
              {entry.entityType} · {entry.entityId}
            </span>
            <span className="ml-auto text-body-sm text-muted">
              {new Date(entry.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
            </span>
          </div>

          <p className="text-body-sm">
            <span className="text-muted">{t('actor')}: </span>
            {entry.actorEmail ?? entry.actorUserId ?? entry.actorRole}
          </p>

          {entry.reason === null ? null : (
            <p className="text-body-sm">
              <span className="text-muted">{t('reason')}: </span>
              {entry.reason}
            </p>
          )}

          {entry.changes.length === 0 ? (
            entry.noChange ? (
              <p className="text-body-sm text-muted">{t('noChanges')}</p>
            ) : null
          ) : (
            <dl className="flex flex-col gap-xs">
              {entry.changes.map((change) => (
                <div key={change.field} className="flex flex-wrap items-baseline gap-base">
                  <dt className="font-mono text-body-sm">{change.field}</dt>
                  {/* The whole point of the diff: the field, what it was, what it is. */}
                  <dd className="text-body-sm text-muted">{describe(change)}</dd>
                  <Badge tone="neutral">{t(change.kind)}</Badge>
                </div>
              ))}
            </dl>
          )}

          <p className="text-body-sm text-muted">
            {t('context')}: {entry.ip} · {entry.userAgent}
          </p>
        </CardContent>
      </Card>
    </li>
  )
}
