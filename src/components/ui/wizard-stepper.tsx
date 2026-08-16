import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

import { Icon } from './icon'

/**
 * `WizardStepper` — `22-design-system.md` §Patterns, `ADR-013`.
 *
 * **Shows stages, not steps.** Three of them, containing ten logical steps. The `*_step_N`
 * screens are where each step's *content* comes from; they are not the source of how many
 * steps a customer perceives, and ten dots on a mobile form is where drop-off happens.
 *
 * The stage list is derived from `STEP_STAGE` in `modules/project/domain/steps.ts` by the
 * caller rather than restated here — a second copy would drift the first time a step moves
 * between stages.
 *
 * A completed stage is a **link**; the current one is marked `aria-current`; a future one is
 * inert. That asymmetry is the accessible version of the affordance the design draws with
 * colour alone.
 */

export type StepperStage = {
  key: string
  labelKey: string
  state: 'complete' | 'current' | 'upcoming'
  href?: string
}

export function WizardStepper({
  stages,
  className,
}: {
  stages: readonly StepperStage[]
  className?: string
}) {
  const t = useTranslations('wizard')

  return (
    <nav aria-label={t('progressLabel')} className={cn('w-full', className)}>
      <ol className="flex items-center gap-base">
        {stages.map((stage, index) => {
          const isLast = index === stages.length - 1

          return (
            <li key={stage.key} className="flex flex-1 items-center gap-base">
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full text-label-md',
                  stage.state === 'complete' && 'bg-action text-on-action',
                  stage.state === 'current' && 'bg-action text-on-action',
                  stage.state === 'upcoming' && 'bg-panel-hover text-muted',
                )}
                // The number is decorative once a tick replaces it; the accessible name comes
                // from the label beside it plus the state text below.
                aria-hidden="true"
              >
                {stage.state === 'complete' ? <Icon name="check" dense /> : index + 1}
              </span>

              <span className="flex min-w-0 flex-col">
                {stage.state === 'complete' && stage.href !== undefined ? (
                  <a
                    href={stage.href}
                    className={cn(
                      'truncate text-body-sm underline underline-offset-2',
                      'hover:text-action',
                    )}
                  >
                    {t(stage.labelKey)}
                  </a>
                ) : (
                  <span
                    aria-current={stage.state === 'current' ? 'step' : undefined}
                    className={cn(
                      'truncate text-body-sm',
                      stage.state === 'current' ? 'font-heading' : 'text-muted',
                    )}
                  >
                    {t(stage.labelKey)}
                  </span>
                )}
                {/* Announced, not drawn: the visual state is colour and a tick, neither of
                    which a screen reader conveys. */}
                <span className="sr-only">{t(`stageState.${stage.state}`)}</span>
              </span>

              {isLast ? null : (
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-px flex-1',
                    stage.state === 'complete' ? 'bg-action' : 'bg-divider',
                  )}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
