'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState, useTransition } from 'react'

import { patchStepAction, validateProjectAction } from '@/app/actions/project'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { WizardStepper, type StepperStage } from '@/components/ui/wizard-stepper'
import { Link } from '@/i18n/navigation'
import { isAttributeVisible } from '@/modules/catalog/domain/authoring-rules'
import type { ProjectView } from '@/modules/project/application/project-service'

import type { ReadinessIssue } from '@/modules/project/domain/readiness'
import {
  deriveAreaM2,
  STAGES,
  STEP_STAGE,
  STEPS,
  type Stage,
  type Step,
} from '@/modules/project/domain/steps'

import { ProjectAttachments } from './attachments'

/**
 * The configurator — `create_project_wizard_refined_style`, tasks 4.1 to 4.4 and 4.7.
 *
 * ## What this component does and does not hold
 *
 * `07` §Forms: state lives in the database, not in a client store. This holds **the current
 * step and the field values not yet saved**, and nothing else. Every step writes through
 * `patchStep` as soon as it is left, which is what makes the gate's "close the browser and
 * come back" half true — and why "Save draft" calls nothing new. The draft is already saved;
 * the button exists to reassure and to exit.
 *
 * ## Three stages, ten steps
 *
 * `ADR-013`. The stepper shows stages; the form walks steps. Both read `STEP_STAGE` from the
 * domain rather than restating the mapping, so moving a step between stages is one edit.
 *
 * ## No prices here
 *
 * `10` §Field specifics is explicit: the designs show a price beside each option and V1 does
 * not, because option prices are per manufacturer and no manufacturer has been chosen yet
 * (`ADR-006`). The band appears at the results step, in Phase 5.
 */

export type WizardAttribute = {
  attributeId: string
  key: string
  label: string
  inputType: 'NUMBER' | 'SELECT' | 'MULTISELECT' | 'BOOL' | 'TEXT'
  isRequired: boolean
  showIfAttributeKey: string | null
  showIfValue: string | null
  options: { optionId: string; value: string; label: string }[]
}

export function ProjectWizard({
  project,
  attributes,
  cities,
  districts,
  uploadPolicy,
  signedIn,
}: {
  project: ProjectView
  attributes: WizardAttribute[]
  cities: { id: string; name: string }[]
  districts: { id: string; cityId: string; name: string }[]
  /**
   * `14` §Limits for `PROJECT`, passed from the server rather than imported here.
   *
   * The policy table lives in `modules/media/domain`, and a client component importing a
   * module's domain would put it in the browser bundle along with everything it references.
   * The page reads it once and hands over three numbers — the same three the service enforces,
   * so the button and the server cannot disagree about what is allowed.
   */
  uploadPolicy: { accept: string; maxBytes: number; maxCount: number }
  /**
   * Whether the visitor has an account, resolved on the server.
   *
   * Passed rather than detected, because the only honest source is the session cookie and it
   * is `httpOnly` — a client component cannot see it, and anything it could see (a
   * localStorage flag, a non-httpOnly mirror) would be a second, forgeable answer to a
   * question the server already answered correctly.
   */
  signedIn: boolean
}) {
  const t = useTranslations('wizard')
  const [pending, startTransition] = useTransition()

  const [current, setCurrent] = useState<Step>('dimensions')
  const [view, setView] = useState<ProjectView>(project)
  const [issues, setIssues] = useState<ReadinessIssue[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Unsaved field values, keyed by field. Cleared into `view` when the step is saved.
  const [draft, setDraft] = useState<Record<string, string>>({})

  const field = (name: string, fallback: number | string | null) =>
    draft[name] ?? (fallback === null ? '' : String(fallback))

  /**
   * Answers keyed by attribute key — what `isAttributeVisible` consumes.
   *
   * The **same function the server calls** in `checkReadiness` (`10` §Validation asks for
   * client and server to evaluate from the same data in the same way). A wizard that hid a
   * field the server then demanded is the failure this prevents.
   */
  const answers = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const value of view.values) {
      const attribute = attributes.find((row) => row.attributeId === value.attributeId)
      if (attribute === undefined) continue
      map[attribute.key] =
        value.optionId ??
        value.textValue ??
        (value.boolValue === null ? null : String(value.boolValue))
    }
    return map
  }, [view.values, attributes])

  const visibleAttributes = attributes.filter((attribute) => isAttributeVisible(attribute, answers))

  const stages: StepperStage[] = STAGES.map((stage) => ({
    key: stage,
    labelKey: `stage.${stage}`,
    state: stageState(stage, current),
  }))

  function save(step: Step, data: Record<string, unknown>, then?: () => void) {
    startTransition(async () => {
      const result = (await patchStepAction({ projectId: view.projectId, step, data })) as
        { data: ProjectView } | { error: { message: string } }

      if ('error' in result) {
        setMessage(result.error.message)
        return
      }

      setView(result.data)
      setDraft({})
      setMessage(t('saved'))
      then?.()
    })
  }

  function go(step: Step) {
    setCurrent(step)
    setMessage(null)
  }

  function next() {
    const index = STEPS.indexOf(current)
    const following = STEPS[index + 1]
    if (following !== undefined) go(following)
  }

  function runValidate() {
    startTransition(async () => {
      const result = (await validateProjectAction({ projectId: view.projectId })) as
        | { data: { ready: boolean; issues: ReadinessIssue[]; status: string } }
        | { error: { message: string } }

      if ('error' in result) {
        setMessage(result.error.message)
        return
      }

      setIssues(result.data.issues)
      setView({ ...view, status: result.data.status as ProjectView['status'] })
      setMessage(result.data.ready ? t('ready') : t('notReady'))
    })
  }

  // Live, derived, never typed (`10` §Field specifics).
  const liveArea = deriveAreaM2(
    Number.parseInt(field('widthMm', view.widthMm), 10) || null,
    Number.parseInt(field('depthMm', view.depthMm), 10) || null,
  )

  return (
    <div className="flex flex-col gap-sm">
      <WizardStepper stages={stages} />

      {message === null ? null : (
        <p role="status" className="text-body-sm text-muted">
          {message}
        </p>
      )}

      <Card density="dense" className="flex flex-col gap-base">
        <CardTitle>{t(`step.${current}`)}</CardTitle>

        {current === 'dimensions' ? (
          <div className="flex flex-col gap-base">
            <div className="flex flex-wrap gap-base">
              {(['widthMm', 'depthMm', 'heightMm'] as const).map((name) => (
                <div key={name} className="flex flex-col gap-0.5">
                  <Label htmlFor={name}>{t(`field.${name}`)}</Label>
                  <Input
                    id={name}
                    inputMode="numeric"
                    value={field(name, view[name])}
                    onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
                    className="w-32"
                  />
                </div>
              ))}
            </div>

            {/* Derived and shown live. There is no input for it, and no step schema accepts
                one — a typed area that disagrees with the dimensions is a support ticket. */}
            <p className="text-body-md">
              {t('areaLive', { area: liveArea === null ? '—' : String(liveArea) })}
            </p>

            <StepButtons
              pending={pending}
              onSave={() =>
                save('dimensions', {
                  widthMm: toInt(field('widthMm', view.widthMm)),
                  depthMm: toInt(field('depthMm', view.depthMm)),
                  heightMm: toInt(field('heightMm', view.heightMm)),
                })
              }
              onNext={() =>
                save(
                  'dimensions',
                  {
                    widthMm: toInt(field('widthMm', view.widthMm)),
                    depthMm: toInt(field('depthMm', view.depthMm)),
                    heightMm: toInt(field('heightMm', view.heightMm)),
                  },
                  next,
                )
              }
            />
          </div>
        ) : null}

        {current === 'projectType' ? (
          <ChoiceStep
            options={['NEW_BUILD', 'RENOVATION']}
            selected={view.projectType}
            labelFor={(value) => t(`projectType.${value}`)}
            pending={pending}
            onChoose={(value) => save('projectType', { projectType: value }, next)}
          />
        ) : null}

        {current === 'installationType' ? (
          <ChoiceStep
            options={['WALL_MOUNTED', 'FREESTANDING', 'ROOF', 'OTHER']}
            selected={view.installationType}
            labelFor={(value) => t(`installationType.${value}`)}
            pending={pending}
            onChoose={(value) => save('installationType', { installationType: value }, next)}
          />
        ) : null}

        {current === 'options' ? (
          <div className="flex flex-col gap-base">
            {visibleAttributes.length === 0 ? (
              <p className="text-body-sm text-muted">{t('noOptions')}</p>
            ) : null}

            {visibleAttributes.map((attribute) => (
              <fieldset key={attribute.attributeId} className="flex flex-col gap-xs">
                <legend className="text-label-md uppercase text-muted">
                  {attribute.label}
                  {attribute.isRequired ? ' *' : ''}
                </legend>

                {attribute.options.map((option) => {
                  const chosen = view.values.some((value) => value.optionId === option.optionId)
                  return (
                    <label
                      key={option.optionId}
                      className="flex min-h-11 items-center gap-base text-body-sm"
                    >
                      <input
                        type={attribute.inputType === 'MULTISELECT' ? 'checkbox' : 'radio'}
                        name={attribute.attributeId}
                        checked={chosen}
                        onChange={() => chooseOption(attribute, option.optionId)}
                      />
                      {/* No price. `10` §Field specifics: option prices are per manufacturer
                          and none has been chosen (`ADR-006`). */}
                      {option.label}
                    </label>
                  )
                })}
              </fieldset>
            ))}

            <StepButtons pending={pending} onSave={() => save('options', {})} onNext={next} />
          </div>
        ) : null}

        {current === 'location' ? (
          <div className="flex flex-col gap-base">
            {/* The copy that earns the field (`10` §Field specifics): asking for a location
                without saying why lowers completion. */}
            <p className="text-body-sm text-muted">{t('locationWhy')}</p>

            <div className="flex flex-wrap gap-base">
              <label className="flex flex-col gap-0.5">
                <span className="text-label-md uppercase text-muted">{t('field.cityId')}</span>
                <select
                  value={field('cityId', view.cityId)}
                  onChange={(event) =>
                    setDraft({ ...draft, cityId: event.target.value, districtId: '' })
                  }
                  className="min-h-11 rounded-sm border border-control-border bg-panel px-base text-body-sm"
                >
                  <option value="">{t('choose')}</option>
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-0.5">
                <span className="text-label-md uppercase text-muted">{t('field.districtId')}</span>
                <select
                  value={field('districtId', view.districtId)}
                  onChange={(event) => setDraft({ ...draft, districtId: event.target.value })}
                  className="min-h-11 rounded-sm border border-control-border bg-panel px-base text-body-sm"
                >
                  <option value="">{t('choose')}</option>
                  {districts
                    .filter((district) => district.cityId === field('cityId', view.cityId))
                    .map((district) => (
                      <option key={district.id} value={district.id}>
                        {district.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <StepButtons
              pending={pending}
              onSave={() => save('location', locationPayload(field, view, draft))}
              onNext={() => save('location', locationPayload(field, view, draft), next)}
            />
          </div>
        ) : null}

        {current === 'timing' ? (
          <ChoiceStep
            options={['ASAP', 'M1_3', 'M3_6', 'PLANNING']}
            selected={view.timing}
            labelFor={(value) => t(`timing.${value}`)}
            pending={pending}
            onChoose={(value) => save('timing', { timing: value }, next)}
          />
        ) : null}

        {current === 'attachments' ? (
          <div className="flex flex-col gap-base">
            {/*
             * Task 4.6. `PHOTO` and `DOCUMENT` both — the kind is derived from the file's
             * MIME type server-side, never asked for here (`14` §Limits: MIME comes from
             * content, not from what the client said).
             *
             * `onChange` replaces the whole view because `addAttachment` and
             * `removeAttachment` return one, and a component holding its own copy of the
             * attachment list is a second source of truth for a step whose entire point is
             * that the server holds the state (`07` §Forms).
             */}
            <ProjectAttachments
              project={view}
              accept={uploadPolicy.accept}
              maxBytes={uploadPolicy.maxBytes}
              maxCount={uploadPolicy.maxCount}
              onChange={setView}
            />

            <Label htmlFor="note">{t('field.note')}</Label>
            <Textarea
              id="note"
              value={field('note', view.note)}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
            />
            <StepButtons
              pending={pending}
              onSave={() => save('attachments', { note: field('note', view.note) })}
              onNext={() => save('attachments', { note: field('note', view.note) }, next)}
            />
          </div>
        ) : null}

        {current === 'summary' ? (
          <div className="flex flex-col gap-base">
            <dl className="flex flex-col gap-0.5 text-body-sm">
              <SummaryRow label={t('field.widthMm')} value={view.widthMm} />
              <SummaryRow label={t('field.depthMm')} value={view.depthMm} />
              <SummaryRow label={t('field.heightMm')} value={view.heightMm} />
              <SummaryRow label={t('areaLabel')} value={view.areaM2} />
            </dl>

            <Button onClick={runValidate} disabled={pending}>
              {t('checkReadiness')}
            </Button>

            {issues === null ? null : issues.length === 0 ? (
              <div className="flex flex-col gap-base">
                <p className="text-body-md">{t('ready')}</p>

                {/*
                 * **The account wall**, and this is the only place it stands (`ADR-021`,
                 * `10` §Anonymous drafts). Configuring is public; requesting offers is not.
                 *
                 * `signedIn` comes from the server, so an anonymous visitor sees the
                 * sign-in call to action and a signed-in one sees the request itself. The
                 * draft id rides along in `?proje=`, which is what `claimThen` in the auth
                 * forms reads — so the visitor comes back to *this* project owned by their
                 * new account rather than to a dashboard that lists it among others.
                 *
                 * The request itself is Phase 6. What exists now is the wall and the claim
                 * that gets a customer past it, which is exactly what the phase gate asks
                 * for and nothing more.
                 */}
                {signedIn ? (
                  <p className="text-body-sm text-muted">{t('offersNext')}</p>
                ) : (
                  <Button asChild>
                    <Link href={`/kayit?proje=${encodeURIComponent(view.projectId)}`}>
                      {t('signInForOffers')}
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <ul className="flex flex-col gap-xs">
                {issues.map((issue, index) => (
                  <li key={index} className="text-body-sm">
                    {/* Each issue carries its step, so the summary links straight to the
                        offending field — `10` §Validation asks for exactly this. */}
                    <button
                      type="button"
                      onClick={() => go(issue.step)}
                      className="underline underline-offset-2 hover:text-action"
                    >
                      {t(`issue.${issue.code}`)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-base">
        {STEPS.filter((step) => STEP_STAGE[step] !== 'PRODUCT').map((step) => (
          <Button
            key={step}
            variant={step === current ? 'primary' : 'outline'}
            size="dense"
            onClick={() => go(step)}
          >
            {t(`step.${step}`)}
          </Button>
        ))}
      </div>
    </div>
  )

  function chooseOption(attribute: WizardAttribute, optionId: string) {
    const others =
      attribute.inputType === 'MULTISELECT'
        ? view.values.filter(
            (value) => value.attributeId !== attribute.attributeId || value.optionId !== optionId,
          )
        : view.values.filter((value) => value.attributeId !== attribute.attributeId)

    const already = view.values.some((value) => value.optionId === optionId)

    const nextValues = already
      ? others
      : [
          ...others,
          {
            attributeId: attribute.attributeId,
            optionId,
            numberValue: null,
            boolValue: null,
            textValue: null,
          },
        ]

    save('options', {
      values: nextValues.map((value) => ({
        attributeId: value.attributeId,
        optionId: value.optionId,
        numberValue: value.numberValue,
        boolValue: value.boolValue,
        textValue: value.textValue,
      })),
    })
  }
}

function stageState(stage: Stage, current: Step): StepperStage['state'] {
  const currentStage = STEP_STAGE[current]
  const order = STAGES.indexOf(stage)
  const currentOrder = STAGES.indexOf(currentStage)

  if (order < currentOrder) return 'complete'
  if (order === currentOrder) return 'current'
  return 'upcoming'
}

function toInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function locationPayload(
  field: (name: string, fallback: number | string | null) => string,
  view: ProjectView,
  draft: Record<string, string>,
): Record<string, unknown> {
  void draft
  const cityId = field('cityId', view.cityId)
  const districtId = field('districtId', view.districtId)

  return {
    cityId: cityId === '' ? null : cityId,
    districtId: districtId === '' ? null : districtId,
  }
}

function StepButtons({
  pending,
  onSave,
  onNext,
}: {
  pending: boolean
  onSave: () => void
  onNext: () => void
}) {
  const t = useTranslations('wizard')

  return (
    <div className="flex flex-wrap gap-base">
      {/* Already true at all times; the button reassures and exits (`10` §Step structure). */}
      <Button variant="outline" onClick={onSave} disabled={pending}>
        {t('saveDraft')}
      </Button>
      <Button onClick={onNext} disabled={pending}>
        {t('next')}
      </Button>
    </div>
  )
}

function ChoiceStep({
  options,
  selected,
  labelFor,
  pending,
  onChoose,
}: {
  options: readonly string[]
  selected: string | null
  labelFor: (value: string) => string
  pending: boolean
  onChoose: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-base">
      {options.map((value) => (
        <Button
          key={value}
          variant={selected === value ? 'primary' : 'outline'}
          onClick={() => onChoose(value)}
          disabled={pending}
        >
          {labelFor(value)}
        </Button>
      ))}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex justify-between gap-base">
      <dt className="text-muted">{label}</dt>
      <dd>{value === null ? '—' : value}</dd>
    </div>
  )
}
