'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState, useTransition } from 'react'

import {
  createDraftAction,
  publishPriceBookAction,
  savePriceBookAction,
  simulateAction,
} from '@/app/actions/pricing'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CompanyProductView } from '@/modules/catalog/application/company-product-service'
import type {
  PriceBookDetail,
  PriceBookSummary,
} from '@/modules/pricing/application/price-book-service'
import type { SimulateResult } from '@/modules/pricing/application/simulate-service'
import { formatKurus } from '@/shared/money'

/**
 * `manufacturer_pricing_management` — task 3.4.
 *
 * `26-execution-plan.md` §Risk register puts the largest risk in the project on this screen:
 * *if data entry feels like too much work, there is no price; with no price there is no
 * product.* So the design goal is not "expose the schema" — five option modes times regional
 * adjustments times four rule kinds is a form a manufacturer abandons — but "get a usable
 * book out of somebody who came here to type two numbers".
 *
 * Four decisions follow from that, and each one is a deliberate departure from the schema:
 *
 *   **You never start from nothing.** The draft is seeded from the products and options the
 *   company already declared in 3.2. The manufacturer's first screen is their own catalogue
 *   with empty price fields, not an "add product" button over a void.
 *
 *   **Cloning a version is a button, not a menu item.** `08` §Versioning makes editing a
 *   published book *mean* cloning it, so the second and every later price book is made this
 *   way. Burying it would mean the common path is the hidden one.
 *
 *   **Money is typed in lira and stored in kuruş.** Nobody types 450000 for ₺4 500.
 *   `ADR-005` is about storage; asking a human to do the conversion is how you get a price
 *   book that is out by a factor of a hundred and nobody notices until a customer sees it.
 *
 *   **The simulator is beside the form, not behind a tab.** It is the only supported way to
 *   check a book before publishing (`08` §Simulator), and a check you have to navigate to is
 *   a check people skip.
 */

type ItemRow = {
  productId: string
  basePriceLira: string
  minProjectPriceLira: string
  setupFeeLira: string
  unit: 'PER_M2' | 'PER_M' | 'PER_UNIT'
}

type OptionRow = {
  optionId: string
  mode: 'FLAT' | 'PER_M2' | 'PER_M' | 'PER_UNIT' | 'PERCENT'
  valueLira: string
  percent: string
}

type AdjustmentRow = {
  cityId: string
  mode: 'FLAT' | 'PERCENT'
  valueLira: string
  percent: string
}

type RuleRow = {
  kind: 'AREA_DISCOUNT' | 'VALUE_DISCOUNT' | 'SIZE_SURCHARGE' | 'HEIGHT_SURCHARGE'
  thresholdMin: string
  mode: 'FLAT' | 'PERCENT'
  valueLira: string
  percent: string
  note: string
}

const OPTION_MODES = ['FLAT', 'PER_M2', 'PER_M', 'PER_UNIT', 'PERCENT'] as const
const RULE_KINDS = [
  'AREA_DISCOUNT',
  'VALUE_DISCOUNT',
  'SIZE_SURCHARGE',
  'HEIGHT_SURCHARGE',
] as const
const UNIT_BY_BASIS = { AREA_M2: 'PER_M2', LENGTH_M: 'PER_M', UNIT: 'PER_UNIT' } as const

/**
 * The action envelope, unwrapped the same way `supply-forms.tsx` does it: an `ActionResult`
 * is a discriminated envelope rather than a `Result`, because it has to cross the server
 * boundary as plain JSON.
 */
type Envelope = { data: unknown } | { error: { message: string } }

function isError(result: unknown): result is { error: { message: string } } {
  return typeof result === 'object' && result !== null && 'error' in result
}

/** Lira typed by a human → integer kuruş (`ADR-005`). Empty is zero, not NaN. */
function toKurus(lira: string): number {
  const value = Number.parseFloat(lira.replace(',', '.'))
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

function toLira(kurus: number | null | undefined): string {
  return kurus === null || kurus === undefined ? '' : String(kurus / 100)
}

function toNumber(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

export function PricingEditor({
  companyId,
  products,
  books,
  draft,
  cities,
}: {
  companyId: string
  products: CompanyProductView[]
  books: PriceBookSummary[]
  draft: PriceBookDetail | null
  cities: { cityId: string; name: string }[]
}) {
  const t = useTranslations('pricing')
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [simulation, setSimulation] = useState<SimulateResult | null>(null)

  /** Only the products the company said it sells (3.2). Pricing something you do not offer
   * is a row that can never produce a lead. */
  const offered = useMemo(() => products.filter((product) => product.isActive), [products])

  const [productId, setProductId] = useState(offered[0]?.productId ?? '')
  const product = offered.find((candidate) => candidate.productId === productId) ?? null

  const [items, setItems] = useState<ItemRow[]>(() =>
    offered.map((row) => {
      const existing = draft?.items.find((item) => item.productId === row.productId)
      return {
        productId: row.productId,
        basePriceLira: toLira(existing?.basePriceKurus),
        minProjectPriceLira: toLira(existing?.minProjectPriceKurus),
        setupFeeLira: toLira(existing?.setupFeeKurus),
        unit: existing?.unit ?? UNIT_BY_BASIS[row.basisType],
      }
    }),
  )

  const [optionRows, setOptionRows] = useState<OptionRow[]>(() =>
    offered
      .flatMap((row) => row.attributes)
      .flatMap((attribute) => attribute.options)
      // Seeded from what the company offers, so the list is theirs rather than the
      // platform's entire option catalogue.
      .filter((option) => option.isOffered === true)
      .map((option) => {
        const existing = draft?.optionPrices.find((price) => price.optionId === option.optionId)
        return {
          optionId: option.optionId,
          mode: existing?.mode ?? 'FLAT',
          valueLira: toLira(existing?.valueKurus),
          percent:
            existing?.percent === null || existing?.percent === undefined
              ? ''
              : String(existing.percent),
        }
      }),
  )

  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>(() =>
    (draft?.adjustments ?? [])
      .filter((row) => row.cityId !== null)
      .map((row) => ({
        cityId: row.cityId ?? '',
        mode: row.mode,
        valueLira: toLira(row.valueKurus),
        percent: row.percent === null ? '' : String(row.percent),
      })),
  )

  const [rules, setRules] = useState<RuleRow[]>(() =>
    (draft?.rules ?? []).map((rule) => ({
      kind: rule.kind,
      thresholdMin: rule.thresholdMin === null ? '' : String(rule.thresholdMin),
      mode: rule.mode,
      valueLira: toLira(rule.valueKurus),
      percent: rule.percent === null ? '' : String(rule.percent),
      note: rule.note ?? '',
    })),
  )

  const [sim, setSim] = useState({ width: '5', depth: '4', height: '3', quantity: '1' })
  const [simOptions, setSimOptions] = useState<string[]>([])

  const optionLabels = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of offered) {
      for (const attribute of row.attributes) {
        for (const option of attribute.options) {
          map.set(option.optionId, `${attribute.label} · ${option.label}`)
        }
      }
    }
    return map
  }, [offered])

  const published = books.find((book) => book.status === 'PUBLISHED') ?? null

  function payload() {
    return {
      companyId,
      priceBookId: draft?.priceBookId ?? '',
      items: items
        // A product with no base price is simply not in this book — `08` §Failure modes
        // makes that `price-on-request` rather than an error, so a half-filled book is a
        // legitimate save rather than a validation wall.
        .filter((row) => row.basePriceLira.trim() !== '')
        .map((row) => ({
          productId: row.productId,
          basePriceKurus: toKurus(row.basePriceLira),
          unit: row.unit,
          minProjectPriceKurus: toKurus(row.minProjectPriceLira),
          setupFeeKurus: row.setupFeeLira.trim() === '' ? null : toKurus(row.setupFeeLira),
        })),
      optionPrices: optionRows
        .filter((row) =>
          row.mode === 'PERCENT' ? row.percent.trim() !== '' : row.valueLira.trim() !== '',
        )
        .map((row) => ({
          optionId: row.optionId,
          mode: row.mode,
          valueKurus: row.mode === 'PERCENT' ? null : toKurus(row.valueLira),
          percent: row.mode === 'PERCENT' ? toNumber(row.percent) : null,
        })),
      adjustments: adjustments
        .filter((row) => row.cityId !== '')
        .map((row) => ({
          cityId: row.cityId,
          districtId: null,
          mode: row.mode,
          valueKurus: row.mode === 'FLAT' ? toKurus(row.valueLira) : null,
          percent: row.mode === 'PERCENT' ? toNumber(row.percent) : null,
        })),
      rules: rules
        .filter((row) => row.thresholdMin.trim() !== '')
        .map((row) => ({
          kind: row.kind,
          thresholdMin:
            row.kind === 'VALUE_DISCOUNT' ? toKurus(row.thresholdMin) : toNumber(row.thresholdMin),
          thresholdMax: null,
          mode: row.mode,
          valueKurus: row.mode === 'FLAT' ? toKurus(row.valueLira) : null,
          percent: row.mode === 'PERCENT' ? toNumber(row.percent) : null,
          note: row.note === '' ? null : row.note,
        })),
    }
  }

  function onSave() {
    startTransition(async () => {
      const result = (await savePriceBookAction(payload())) as Envelope
      setMessage(isError(result) ? result.error.message : t('saved'))
    })
  }

  function onPublish() {
    startTransition(async () => {
      const saved = (await savePriceBookAction(payload())) as Envelope
      if (isError(saved)) {
        setMessage(saved.error.message)
        return
      }

      const result = (await publishPriceBookAction({
        companyId,
        priceBookId: draft?.priceBookId ?? '',
      })) as Envelope

      setMessage(
        isError(result)
          ? result.error.message
          : t('publishedMessage', { version: (result.data as { version: number }).version }),
      )
    })
  }

  function onClone(fromPriceBookId?: string) {
    startTransition(async () => {
      const result = (await createDraftAction(
        fromPriceBookId === undefined ? { companyId } : { companyId, fromPriceBookId },
      )) as Envelope

      setMessage(
        isError(result)
          ? result.error.message
          : t('draftCreated', { version: (result.data as { version: number }).version }),
      )
    })
  }

  function onSimulate() {
    if (product === null || draft === null) return

    const width = toNumber(sim.width) ?? 0
    const depth = toNumber(sim.depth) ?? 0

    startTransition(async () => {
      // Saved first: simulating what is on screen rather than what is stored would tell the
      // manufacturer their unsaved edits are fine, and then publish something else.
      const saved = (await savePriceBookAction(payload())) as Envelope
      if (isError(saved)) {
        setMessage(saved.error.message)
        return
      }

      const result = (await simulateAction({
        companyId,
        priceBookId: draft.priceBookId,
        productId: product.productId,
        basisType: product.basisType,
        areaM2: product.basisType === 'AREA_M2' ? width * depth : null,
        lengthM: product.basisType === 'LENGTH_M' ? width : null,
        units: product.basisType === 'UNIT' ? toNumber(sim.quantity) : null,
        perimeterM: 2 * (width + depth),
        heightM: toNumber(sim.height),
        quantity: Math.max(1, Math.trunc(toNumber(sim.quantity) ?? 1)),
        selectedOptionIds: simOptions,
      })) as Envelope

      if (isError(result)) setMessage(result.error.message)
      else setSimulation(result.data as SimulateResult)
    })
  }

  if (draft === null) {
    return (
      <Card density="dense" className="flex flex-col gap-base">
        <CardTitle>{t('noDraftTitle')}</CardTitle>
        <p className="text-body-md text-muted">{t('noDraftBody')}</p>
        <div className="flex flex-wrap gap-base">
          <Button onClick={() => onClone()} disabled={pending}>
            {t('startBlank')}
          </Button>
          {books.map((book) => (
            // Cloning is first-class: one button per existing version, in the open.
            <Button
              key={book.priceBookId}
              variant="outline"
              onClick={() => onClone(book.priceBookId)}
              disabled={pending}
            >
              {t('cloneFrom', { version: book.version })}
            </Button>
          ))}
        </div>
        {message === null ? null : <p className="text-body-sm text-muted">{message}</p>}
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-sm lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-sm">
        <Card density="dense" className="flex flex-wrap items-center gap-base">
          <CardTitle className="mr-auto">{t('draftTitle', { version: draft.version })}</CardTitle>
          <Badge tone="progress">{t('statusDraft')}</Badge>
          <Button variant="outline" onClick={onSave} disabled={pending}>
            {t('saveDraft')}
          </Button>
          <Button onClick={onPublish} disabled={pending}>
            {t('publish')}
          </Button>
        </Card>

        {message === null ? null : (
          <p role="status" className="text-body-sm text-muted">
            {message}
          </p>
        )}

        <Card density="dense" className="flex flex-col gap-base">
          <CardTitle>{t('basePrices')}</CardTitle>
          <p className="text-body-sm text-muted">{t('basePricesHelp')}</p>

          {items.map((row, index) => {
            const label =
              offered.find((candidate) => candidate.productId === row.productId)?.name ??
              row.productId
            return (
              <div key={row.productId} className="flex flex-wrap items-end gap-base">
                <span className="min-w-40 text-body-md">{label}</span>
                <LiraField
                  id={`base-${row.productId}`}
                  label={t('basePrice')}
                  value={row.basePriceLira}
                  onChange={(value) =>
                    setItems(replaceAt(items, index, { ...row, basePriceLira: value }))
                  }
                />
                <LiraField
                  id={`min-${row.productId}`}
                  label={t('minProject')}
                  value={row.minProjectPriceLira}
                  onChange={(value) =>
                    setItems(replaceAt(items, index, { ...row, minProjectPriceLira: value }))
                  }
                />
                <LiraField
                  id={`setup-${row.productId}`}
                  label={t('setupFee')}
                  value={row.setupFeeLira}
                  onChange={(value) =>
                    setItems(replaceAt(items, index, { ...row, setupFeeLira: value }))
                  }
                />
              </div>
            )
          })}
        </Card>

        <Card density="dense" className="flex flex-col gap-base">
          <CardTitle>{t('optionPrices')}</CardTitle>
          <p className="text-body-sm text-muted">{t('optionPricesHelp')}</p>

          {optionRows.length === 0 ? (
            <p className="text-body-sm text-muted">{t('noOptions')}</p>
          ) : (
            optionRows.map((row, index) => (
              <div key={row.optionId} className="flex flex-wrap items-end gap-base">
                <span className="min-w-52 text-body-md">
                  {optionLabels.get(row.optionId) ?? row.optionId}
                </span>
                <label className="flex flex-col gap-0.5">
                  <span className="text-label-md uppercase text-muted">{t('mode')}</span>
                  <select
                    value={row.mode}
                    onChange={(event) =>
                      setOptionRows(
                        replaceAt(optionRows, index, {
                          ...row,
                          mode: event.target.value as OptionRow['mode'],
                        }),
                      )
                    }
                    className="min-h-11 rounded-sm border border-control-border bg-panel px-base text-body-sm"
                  >
                    {OPTION_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {t(`mode_${mode}`)}
                      </option>
                    ))}
                  </select>
                </label>
                {row.mode === 'PERCENT' ? (
                  <PercentField
                    id={`optpct-${row.optionId}`}
                    label={t('percent')}
                    value={row.percent}
                    onChange={(value) =>
                      setOptionRows(replaceAt(optionRows, index, { ...row, percent: value }))
                    }
                  />
                ) : (
                  <LiraField
                    id={`opt-${row.optionId}`}
                    label={t('price')}
                    value={row.valueLira}
                    onChange={(value) =>
                      setOptionRows(replaceAt(optionRows, index, { ...row, valueLira: value }))
                    }
                  />
                )}
              </div>
            ))
          )}
        </Card>

        <Card density="dense" className="flex flex-col gap-base">
          <CardTitle>{t('regional')}</CardTitle>
          <p className="text-body-sm text-muted">{t('regionalHelp')}</p>

          {adjustments.map((row, index) => (
            <div key={`${row.cityId}-${index}`} className="flex flex-wrap items-end gap-base">
              <label className="flex flex-col gap-0.5">
                <span className="text-label-md uppercase text-muted">{t('city')}</span>
                <select
                  value={row.cityId}
                  onChange={(event) =>
                    setAdjustments(
                      replaceAt(adjustments, index, { ...row, cityId: event.target.value }),
                    )
                  }
                  className="min-h-11 rounded-sm border border-control-border bg-panel px-base text-body-sm"
                >
                  {cities.map((city) => (
                    <option key={city.cityId} value={city.cityId}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </label>
              <LiraField
                id={`adj-${index}`}
                label={t('surcharge')}
                value={row.valueLira}
                onChange={(value) =>
                  setAdjustments(replaceAt(adjustments, index, { ...row, valueLira: value }))
                }
              />
              <Button
                variant="outline"
                onClick={() => setAdjustments(adjustments.filter((_, at) => at !== index))}
              >
                {t('remove')}
              </Button>
            </div>
          ))}

          <Button
            variant="outline"
            onClick={() =>
              setAdjustments([
                ...adjustments,
                { cityId: cities[0]?.cityId ?? '', mode: 'FLAT', valueLira: '', percent: '' },
              ])
            }
          >
            {t('addRegional')}
          </Button>
        </Card>

        <Card density="dense" className="flex flex-col gap-base">
          <CardTitle>{t('rules')}</CardTitle>
          <p className="text-body-sm text-muted">{t('rulesHelp')}</p>

          {rules.map((row, index) => (
            <div key={index} className="flex flex-wrap items-end gap-base">
              <label className="flex flex-col gap-0.5">
                <span className="text-label-md uppercase text-muted">{t('ruleKind')}</span>
                <select
                  value={row.kind}
                  onChange={(event) =>
                    setRules(
                      replaceAt(rules, index, {
                        ...row,
                        kind: event.target.value as RuleRow['kind'],
                      }),
                    )
                  }
                  className="min-h-11 rounded-sm border border-control-border bg-panel px-base text-body-sm"
                >
                  {RULE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`rule_${kind}`)}
                    </option>
                  ))}
                </select>
              </label>
              {/* The threshold's unit depends on the kind — m², ₺ or m — so it is labelled
                  per kind rather than with a generic "threshold". */}
              <label className="flex flex-col gap-0.5">
                <span className="text-label-md uppercase text-muted">
                  {t(`threshold_${row.kind}`)}
                </span>
                <Input
                  value={row.thresholdMin}
                  inputMode="decimal"
                  onChange={(event) =>
                    setRules(replaceAt(rules, index, { ...row, thresholdMin: event.target.value }))
                  }
                />
              </label>
              <PercentField
                id={`rulepct-${index}`}
                label={t('percent')}
                value={row.percent}
                onChange={(value) =>
                  setRules(replaceAt(rules, index, { ...row, percent: value, mode: 'PERCENT' }))
                }
              />
              <Button
                variant="outline"
                onClick={() => setRules(rules.filter((_, at) => at !== index))}
              >
                {t('remove')}
              </Button>
            </div>
          ))}

          <Button
            variant="outline"
            onClick={() =>
              setRules([
                ...rules,
                {
                  kind: 'AREA_DISCOUNT',
                  thresholdMin: '',
                  mode: 'PERCENT',
                  valueLira: '',
                  percent: '',
                  note: '',
                },
              ])
            }
          >
            {t('addRule')}
          </Button>
        </Card>
      </div>

      <aside className="flex w-full flex-col gap-sm lg:w-96">
        <Card density="dense" className="flex flex-col gap-base">
          <CardTitle>
            <span className="flex items-center gap-xs">
              <Icon name="payments" dense />
              {t('simulator')}
            </span>
          </CardTitle>
          <p className="text-body-sm text-muted">{t('simulatorHelp')}</p>

          <label className="flex flex-col gap-0.5">
            <span className="text-label-md uppercase text-muted">{t('product')}</span>
            <select
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              className="min-h-11 rounded-sm border border-control-border bg-panel px-base text-body-sm"
            >
              {offered.map((row) => (
                <option key={row.productId} value={row.productId}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-base">
            <NumberField
              id="sim-w"
              label={t('width')}
              value={sim.width}
              onChange={(v) => setSim({ ...sim, width: v })}
            />
            <NumberField
              id="sim-d"
              label={t('depth')}
              value={sim.depth}
              onChange={(v) => setSim({ ...sim, depth: v })}
            />
            <NumberField
              id="sim-h"
              label={t('height')}
              value={sim.height}
              onChange={(v) => setSim({ ...sim, height: v })}
            />
          </div>

          {product === null ? null : (
            <fieldset className="flex flex-col gap-xs">
              <legend className="text-label-md uppercase text-muted">{t('includedOptions')}</legend>
              {product.attributes.flatMap((attribute) =>
                attribute.options
                  .filter((option) => option.isOffered === true)
                  .map((option) => (
                    <label
                      key={option.optionId}
                      className="flex min-h-11 items-center gap-base text-body-sm"
                    >
                      <input
                        type="checkbox"
                        checked={simOptions.includes(option.optionId)}
                        onChange={(event) =>
                          setSimOptions(
                            event.target.checked
                              ? [...simOptions, option.optionId]
                              : simOptions.filter((id) => id !== option.optionId),
                          )
                        }
                      />
                      {attribute.label}
                      {' · '}
                      {option.label}
                    </label>
                  )),
              )}
            </fieldset>
          )}

          <Button onClick={onSimulate} disabled={pending || product === null}>
            {t('runSimulation')}
          </Button>

          {simulation === null ? null : <SimulationPanel result={simulation} />}
        </Card>

        <Card density="dense" className="flex flex-col gap-base">
          <CardTitle>
            <span className="flex items-center gap-xs">
              <Icon name="description" dense />
              {t('versionHistory')}
            </span>
          </CardTitle>

          {books.map((book) => (
            <div key={book.priceBookId} className="flex items-center gap-base">
              <span className="mr-auto text-body-sm">
                {t('version', { version: book.version })}
              </span>
              <Badge tone={book.status === 'PUBLISHED' ? 'progress' : 'neutral'}>
                {t(`status${book.status}`)}
              </Badge>
              {book.status === 'DRAFT' ? null : (
                <Button
                  variant="outline"
                  onClick={() => onClone(book.priceBookId)}
                  disabled={pending}
                >
                  {t('clone')}
                </Button>
              )}
            </div>
          ))}

          {published === null ? (
            <p className="text-body-sm text-muted">{t('noPublished')}</p>
          ) : null}
        </Card>
      </aside>
    </div>
  )
}

/**
 * The simulator's answer — the owning manufacturer's **full** breakdown (`ADR-006` item 3).
 * This is the one surface in the product where line items are correct to show.
 */
function SimulationPanel({ result }: { result: SimulateResult }) {
  const t = useTranslations('pricing')

  if (result.estimate === null) {
    return (
      <div className="flex flex-col gap-xs rounded-sm bg-panel-hover p-base">
        <p className="text-body-md">
          {t(`unpriced_${result.unpricedReason ?? 'product-not-in-book'}`)}
        </p>
        <Warnings warnings={result.warnings} />
      </div>
    )
  }

  const { breakdown } = result.estimate

  return (
    <div className="flex flex-col gap-xs rounded-sm bg-panel-hover p-base">
      <p className="font-heading text-headline-md">{formatKurus(result.estimate.netKurus)}</p>
      <p className="text-label-md uppercase text-muted">{t('netLabel')}</p>

      <dl className="flex flex-col gap-0.5 text-body-sm">
        <Line label={t('lineBase')} value={breakdown.baseKurus} />
        <Line label={t('lineOptions')} value={breakdown.optionsKurus} />
        <Line label={t('lineSetup')} value={breakdown.setupKurus} />
        <Line label={t('lineSubtotal')} value={breakdown.subtotalKurus} />
        <Line label={t('lineRules')} value={breakdown.rulesKurus} />
        <Line label={t('lineRegional')} value={breakdown.regionalKurus} />
        {breakdown.floorApplied ? (
          // Worth its own line: "the floor bound this" explains why two different
          // configurations quote the same number.
          <Line label={t('lineFloor')} value={breakdown.minProjectPriceKurus} />
        ) : null}
      </dl>

      <p className="text-body-sm text-muted">
        {t('bandPreview', {
          low: formatKurus(result.estimate.bandLowKurus),
          high: formatKurus(result.estimate.bandHighKurus),
        })}
      </p>

      <Warnings warnings={result.warnings} />
    </div>
  )
}

function Warnings({ warnings }: { warnings: SimulateResult['warnings'] }) {
  const t = useTranslations('pricing')
  if (warnings.length === 0) return null

  return (
    <ul className="flex flex-col gap-xs">
      {warnings.map((warning, index) => (
        <li key={index} className="flex items-start gap-xs text-body-sm text-muted">
          <Icon name="info" dense />
          {warning.kind === 'non-monotonic-in-basis'
            ? t('warnNonMonotonic', { at: warning.atBasis, previous: warning.previousBasis })
            : warning.kind === 'rule-never-fires'
              ? t('warnRuleNeverFires')
              : t('warnFloorDominates')}
        </li>
      ))}
    </ul>
  )
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-base">
      <dt className="text-muted">{label}</dt>
      <dd>{formatKurus(value)}</dd>
    </div>
  )
}

function LiraField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        inputMode="decimal"
        // Lira, not kuruş. `toKurus` converts on the way to the service.
        placeholder="0"
        onChange={(event) => onChange(event.target.value)}
        className="w-32"
      />
    </div>
  )
}

function PercentField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        inputMode="decimal"
        placeholder="0"
        onChange={(event) => onChange(event.target.value)}
        className="w-24"
      />
    </div>
  )
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        inputMode="decimal"
        onChange={(event) => onChange(event.target.value)}
        className="w-20"
      />
    </div>
  )
}

function replaceAt<T>(rows: T[], index: number, next: T): T[] {
  return rows.map((row, at) => (at === index ? next : row))
}
