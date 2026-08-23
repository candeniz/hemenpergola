'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { duplicateProjectAction } from '@/app/actions/project'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import type { ProjectSummary } from '@/modules/project/application/project-service'

/**
 * The customer's project list — task 4.8, `customer_dashboard_final` and
 * `customer_dashboard_empty_state`, with `customer_dashboard_tablet_view` supplying the
 * two-column breakpoint.
 *
 * A client component only because of the duplicate button (task 4.9); the rows themselves are
 * data the server already has. `07` §Component layers wants `'use client'` for real
 * interactivity and nothing else, so the empty state, the cards and the badges all render on
 * the server the first time.
 *
 * **No prices anywhere.** `ADR-006`: an estimate is per manufacturer and none has been chosen
 * yet, so a list of projects shows dimensions and status, never money. The Stitch screen shows
 * a figure; it predates the ADR.
 */
/**
 * Status → badge tone. `22` §Semantic mapping owns the five tones and this is the only place
 * a project status is mapped onto one, so the dashboard and any later list agree.
 *
 * `SUBMITTED` is `progress` rather than `new`: from the customer's side the interesting fact
 * is that somebody is now working on it. `CLOSED` is `cancelled` — the tone family's name is
 * about the visual weight, not about blame.
 */
const STATUS_TONE: Record<
  ProjectSummary['status'],
  'new' | 'progress' | 'waiting' | 'neutral' | 'cancelled'
> = {
  DRAFT: 'neutral',
  READY: 'new',
  SUBMITTED: 'progress',
  CLOSED: 'cancelled',
}

export function ProjectList({ projects }: { projects: readonly ProjectSummary[] }) {
  const t = useTranslations('projects')
  const status = useTranslations('projects.status')
  const format = useFormatter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function duplicate(projectId: string) {
    startTransition(async () => {
      const result = (await duplicateProjectAction({ projectId })) as
        { data: { projectId: string } } | { error: { message: string } }

      if ('error' in result) {
        setMessage(result.error.message)
        return
      }

      // A full navigation for the same reason `ProductChooser` uses one: the wizard page loads
      // the draft it is about to edit, and client state carried into it would be stale.
      window.location.assign(`/proje/${result.data.projectId}`)
    })
  }

  /*
   * `customer_dashboard_empty_state`. A first-time visitor's dashboard is the screen that
   * decides whether they start at all, so it carries the action rather than an apology.
   */
  if (projects.length === 0) {
    return (
      <Card className="flex flex-col items-start gap-base">
        <CardTitle>{t('emptyTitle')}</CardTitle>
        <CardDescription>{t('emptyBody')}</CardDescription>
        <Button asChild>
          <Link href="/proje/yeni">{t('startFirst')}</Link>
        </Button>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-sm">
      {message === null ? null : (
        <p role="status" className="text-body-sm text-muted">
          {message}
        </p>
      )}

      <ul className="grid list-none gap-base p-0 md:grid-cols-2">
        {projects.map((project) => (
          <li key={project.projectId}>
            <Card className="flex h-full flex-col gap-base">
              <div className="flex items-start justify-between gap-base">
                <CardTitle>{project.title ?? t('untitled')}</CardTitle>
                <Badge tone={STATUS_TONE[project.status]}>{status(project.status)}</Badge>
              </div>

              <CardDescription>
                {project.areaM2 === null
                  ? t('noDimensions')
                  : t('area', {
                      area: format.number(project.areaM2, { maximumFractionDigits: 2 }),
                    })}
              </CardDescription>

              <CardDescription>
                {t('attachments', { count: project.attachmentCount })}
              </CardDescription>

              {/*
               * `Europe/Istanbul` for display, UTC in the database (`CLAUDE.md`
               * §Conventions). The service hands over an ISO string precisely so that the
               * formatting decision is made here, with the locale.
               */}
              <CardDescription>
                {t('updated', {
                  when: format.dateTime(new Date(project.updatedAt), {
                    /*
                     * Explicit options rather than a named format: `i18n/request.ts` defines
                     * no `formats.dateTime`, and next-intl throws on an unknown name — a
                     * failure that only appears once a customer has a project to list.
                     *
                     * `Europe/Istanbul` for display, UTC in the database (`CLAUDE.md`
                     * §Conventions). Named here rather than left to the server's zone,
                     * because a container in UTC would render every timestamp three hours
                     * early and nobody would notice until a customer said so.
                     */
                    timeZone: 'Europe/Istanbul',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                })}
              </CardDescription>

              <div className="mt-auto flex flex-wrap gap-base">
                <Button asChild variant="outline">
                  <Link href={`/proje/${project.projectId}`}>{t('open')}</Link>
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => duplicate(project.projectId)}
                  disabled={pending}
                >
                  {t('duplicate')}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
