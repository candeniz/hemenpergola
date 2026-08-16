'use client'

import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import {
  createAttributeAction,
  createCategoryAction,
  createOptionAction,
  createProductAction,
  deactivateOptionAction,
  deleteOptionAction,
  getProductAction,
  updateProductAction,
} from '@/app/actions/catalog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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

import type {
  CategorySummary,
  ProductDetail,
  ProductSummary,
} from '@/modules/catalog/application/catalog-service'

/**
 * `super_admin_product_catalog_management`.
 *
 * The screen holds no rules. Every button calls a server action, which calls the service,
 * which is where "an option that is referenced cannot be deleted" and "a required attribute
 * applies to new projects only" actually live (`10-project-configurator.md` §Admin
 * authoring). What the screen owes is that the refusals are *legible*: a `PRECONDITION`
 * carries the reason, and it is rendered rather than swallowed.
 */

type Outcome = { status: number } & (
  { data: unknown; meta: unknown } | { error: { code: string; message: string } }
)

const isError = (
  outcome: Outcome,
): outcome is { status: number } & { error: { code: string; message: string } } =>
  'error' in outcome

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

function Notice({ tone, children }: { tone: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-base text-body-sm ${tone === 'error' ? 'text-destructive' : 'text-muted'}`}
    >
      <Icon name={tone === 'error' ? 'error' : 'info'} dense />
      {children}
    </p>
  )
}

export function CatalogManager({
  categories: initialCategories,
  products: initialProducts,
}: {
  categories: CategorySummary[]
  products: ProductSummary[]
}) {
  const t = useTranslations('admin.catalog')
  const [categories, setCategories] = useState(initialCategories)
  const [products, setProducts] = useState(initialProducts)
  const [openProduct, setOpenProduct] = useState<ProductDetail | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const refreshProduct = async (productId: string) => {
    const outcome = (await getProductAction({ productId })) as Outcome
    if (!isError(outcome) && 'data' in outcome) {
      setOpenProduct((outcome.data as { product: ProductDetail }).product)
    }
  }

  const handle = (
    run: () => Promise<Outcome>,
    onSuccess: (data: unknown) => Promise<void> | void,
  ) => {
    setProblem(null)
    setNote(null)
    start(async () => {
      const outcome = await run()
      if (isError(outcome)) {
        // The service's message is the useful part: "option is referenced by 3 project
        // values… deactivate it instead" is actionable in a way a status code is not.
        setProblem(outcome.error.message)
        return
      }
      if ('data' in outcome) await onSuccess(outcome.data)
    })
  }

  if (openProduct !== null) {
    return (
      <ProductEditor
        product={openProduct}
        pending={pending}
        problem={problem}
        note={note}
        onBack={() => {
          setOpenProduct(null)
          setProblem(null)
          setNote(null)
        }}
        onCreateAttribute={(input) =>
          handle(
            () =>
              createAttributeAction({ ...input, productId: openProduct.id }) as Promise<Outcome>,
            async (data) => {
              if ((data as { impact?: string }).impact === 'new-projects-only') {
                setNote(t('impactNewProjectsOnly'))
              }
              await refreshProduct(openProduct.id)
            },
          )
        }
        onCreateOption={(input) =>
          handle(
            () => createOptionAction(input) as Promise<Outcome>,
            async () => refreshProduct(openProduct.id),
          )
        }
        onDeactivateOption={(optionId) =>
          handle(
            () => deactivateOptionAction({ optionId }) as Promise<Outcome>,
            async () => refreshProduct(openProduct.id),
          )
        }
        onDeleteOption={(optionId) =>
          handle(
            () => deleteOptionAction({ optionId }) as Promise<Outcome>,
            async () => refreshProduct(openProduct.id),
          )
        }
        onToggleActive={(isActive) =>
          handle(
            () => updateProductAction({ productId: openProduct.id, isActive }) as Promise<Outcome>,
            async () => refreshProduct(openProduct.id),
          )
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-lg">
      {problem === null ? null : <Notice tone="error">{problem}</Notice>}

      <Card density="dense">
        <CardHeader>
          <CardTitle>{t('categories')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('nameTr')}</TableHead>
                <TableHead>{t('slugTr')}</TableHead>
                <TableHead>{t('slugEn')}</TableHead>
                <TableHead>{t('products')}</TableHead>
                <TableHead>{t('active')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell>{category.translations.tr?.name ?? category.id}</TableCell>
                  <TableCell className="font-mono text-body-sm">
                    {category.translations.tr?.slug ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-body-sm">
                    {category.translations.en?.slug ?? '—'}
                  </TableCell>
                  <TableCell>{t('productCount', { count: category.productCount })}</TableCell>
                  <TableCell>
                    <Badge tone={category.isActive ? 'progress' : 'neutral'}>
                      {category.isActive ? t('active') : t('inactive')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <CategoryForm
            pending={pending}
            onSubmit={(input) =>
              handle(
                () => createCategoryAction(input) as Promise<Outcome>,
                async () => {
                  const listed = (await import('@/app/actions/catalog')).listCategoriesAction
                  const next = (await listed({ includeInactive: true })) as Outcome
                  if (!isError(next) && 'data' in next) {
                    setCategories((next.data as { categories: CategorySummary[] }).categories)
                  }
                },
              )
            }
          />
        </CardContent>
      </Card>

      <Card density="dense">
        <CardHeader>
          <CardTitle>{t('products')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-md">
          {products.length === 0 ? (
            <p className="text-body-sm text-muted">{t('noProducts')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('nameTr')}</TableHead>
                  <TableHead>{t('basis')}</TableHead>
                  <TableHead>{t('attributes')}</TableHead>
                  <TableHead>{t('active')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>{product.translations.tr?.name ?? product.id}</TableCell>
                    <TableCell>{product.basisType}</TableCell>
                    <TableCell>{t('attributeCount', { count: product.attributeCount })}</TableCell>
                    <TableCell>
                      <Badge tone={product.isActive ? 'progress' : 'neutral'}>
                        {product.isActive ? t('active') : t('inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="dense"
                        onClick={() => void refreshProduct(product.id)}
                      >
                        {t('attributes')}
                        <Icon name="arrow_forward" dense />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <ProductForm
            categories={categories}
            pending={pending}
            onSubmit={(input) =>
              handle(
                () => createProductAction(input) as Promise<Outcome>,
                async () => {
                  const listed = (await import('@/app/actions/catalog')).listProductsAction
                  const next = (await listed({ includeInactive: true })) as Outcome
                  if (!isError(next) && 'data' in next) {
                    setProducts((next.data as { products: ProductSummary[] }).products)
                  }
                },
              )
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}

function CategoryForm({
  pending,
  onSubmit,
}: {
  pending: boolean
  onSubmit: (input: Record<string, unknown>) => void
}) {
  const t = useTranslations('admin.catalog')
  const [nameTr, setNameTr] = useState('')
  const [nameEn, setNameEn] = useState('')

  return (
    <form
      className="grid gap-md md:grid-cols-3"
      action={() => {
        onSubmit({ translations: { tr: { name: nameTr }, en: { name: nameEn } } })
        setNameTr('')
        setNameEn('')
      }}
    >
      <Field
        id="category-name-tr"
        label={t('nameTr')}
        value={nameTr}
        onChange={(event) => setNameTr(event.target.value)}
        required
      />
      <Field
        id="category-name-en"
        label={t('nameEn')}
        hint={t('slugHint')}
        value={nameEn}
        onChange={(event) => setNameEn(event.target.value)}
        required
      />
      <div className="flex items-end">
        <Button type="submit" variant="confirm" size="dense" disabled={pending}>
          {pending ? t('saving') : t('newCategory')}
        </Button>
      </div>
    </form>
  )
}

function ProductForm({
  categories,
  pending,
  onSubmit,
}: {
  categories: CategorySummary[]
  pending: boolean
  onSubmit: (input: Record<string, unknown>) => void
}) {
  const t = useTranslations('admin.catalog')
  const [nameTr, setNameTr] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [basisType, setBasisType] = useState<'AREA_M2' | 'LENGTH_M' | 'UNIT'>('AREA_M2')

  if (categories.length === 0) return null

  return (
    <form
      className="grid gap-md md:grid-cols-5"
      action={() => {
        onSubmit({
          categoryId,
          basisType,
          translations: { tr: { name: nameTr }, en: { name: nameEn } },
        })
        setNameTr('')
        setNameEn('')
      }}
    >
      <Field
        id="product-name-tr"
        label={t('nameTr')}
        value={nameTr}
        onChange={(event) => setNameTr(event.target.value)}
        required
      />
      <Field
        id="product-name-en"
        label={t('nameEn')}
        value={nameEn}
        onChange={(event) => setNameEn(event.target.value)}
        required
      />
      <div className="flex flex-col gap-xs">
        <Label htmlFor="product-category">{t('category')}</Label>
        <select
          id="product-category"
          className="h-11 rounded border border-control-border bg-panel px-sm text-body-md text-on-panel sm:h-10"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.translations.tr?.name ?? category.id}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-xs">
        <Label htmlFor="product-basis">{t('basis')}</Label>
        <select
          id="product-basis"
          className="h-11 rounded border border-control-border bg-panel px-sm text-body-md text-on-panel sm:h-10"
          value={basisType}
          onChange={(event) => setBasisType(event.target.value as typeof basisType)}
        >
          <option value="AREA_M2">{t('basisAreaM2')}</option>
          <option value="LENGTH_M">{t('basisLengthM')}</option>
          <option value="UNIT">{t('basisUnit')}</option>
        </select>
      </div>
      <div className="flex items-end">
        <Button type="submit" variant="confirm" size="dense" disabled={pending}>
          {pending ? t('saving') : t('newProduct')}
        </Button>
      </div>
    </form>
  )
}

function ProductEditor({
  product,
  pending,
  problem,
  note,
  onBack,
  onCreateAttribute,
  onCreateOption,
  onDeactivateOption,
  onDeleteOption,
  onToggleActive,
}: {
  product: ProductDetail
  pending: boolean
  problem: string | null
  note: string | null
  onBack: () => void
  onCreateAttribute: (input: Record<string, unknown>) => void
  onCreateOption: (input: Record<string, unknown>) => void
  onDeactivateOption: (optionId: string) => void
  onDeleteOption: (optionId: string) => void
  onToggleActive: (isActive: boolean) => void
}) {
  const t = useTranslations('admin.catalog')

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex items-center gap-md">
        <Button variant="ghost" size="dense" onClick={onBack}>
          <Icon name="arrow_back" dense />
          {t('backToProducts')}
        </Button>
        <span className="font-heading text-headline-md">
          {product.translations.tr?.name ?? product.id}
        </span>
        <div className="ml-auto flex items-center gap-base">
          <Checkbox
            id="product-active"
            checked={product.isActive}
            onCheckedChange={(value) => onToggleActive(value === true)}
          />
          <Label htmlFor="product-active" className="normal-case">
            {t('active')}
          </Label>
        </div>
      </div>

      {problem === null ? null : <Notice tone="error">{problem}</Notice>}
      {note === null ? null : <Notice tone="info">{note}</Notice>}

      {product.attributes.length === 0 ? (
        <p className="text-body-sm text-muted">{t('noAttributes')}</p>
      ) : (
        product.attributes.map((attribute) => (
          <Card key={attribute.id} density="dense">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-base">
                {attribute.labels.tr ?? attribute.key}
                <code className="text-body-sm text-muted">{attribute.key}</code>
                <Badge tone="neutral">{attribute.inputType}</Badge>
                {attribute.isRequired ? <Badge tone="waiting">{t('required')}</Badge> : null}
                {attribute.affectsPrice ? <Badge tone="new">{t('affectsPrice')}</Badge> : null}
                {/*
                 * The condition, shown as the expression it is. Not run through next-intl:
                 * `motorised = true` is a key and a value, and translating the `=` would be
                 * translating punctuation.
                 */}
                {attribute.showIfAttributeKey === null ? null : (
                  <Badge tone="neutral">
                    <code>{showIfExpression(attribute)}</code>
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-md">
              {attribute.options.length === 0 ? (
                <p className="text-body-sm text-muted">{t('noOptions')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('value')}</TableHead>
                      <TableHead>{t('labelTr')}</TableHead>
                      <TableHead>{t('labelEn')}</TableHead>
                      <TableHead>{t('active')}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attribute.options.map((option) => (
                      <TableRow key={option.id}>
                        <TableCell className="font-mono text-body-sm">{option.value}</TableCell>
                        <TableCell>{option.labels.tr}</TableCell>
                        <TableCell>{option.labels.en}</TableCell>
                        <TableCell>
                          <Badge tone={option.isActive ? 'progress' : 'neutral'}>
                            {option.isActive ? t('active') : t('inactive')}
                          </Badge>
                        </TableCell>
                        <TableCell className="flex gap-base">
                          {/*
                           * Deactivate first, and it is the primary action. `10` §Admin
                           * authoring wants deactivation to be the habit; delete exists for
                           * the option somebody mistyped a minute ago, and the service
                           * refuses it the moment anything references it.
                           */}
                          <Button
                            variant="outline"
                            size="dense"
                            disabled={pending || !option.isActive}
                            onClick={() => onDeactivateOption(option.id)}
                          >
                            {t('deactivate')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="dense"
                            disabled={pending}
                            onClick={() => onDeleteOption(option.id)}
                          >
                            {t('remove')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {attribute.inputType === 'SELECT' || attribute.inputType === 'MULTISELECT' ? (
                <OptionForm
                  attributeId={attribute.id}
                  pending={pending}
                  onSubmit={onCreateOption}
                />
              ) : null}
            </CardContent>
          </Card>
        ))
      )}

      <Card density="dense">
        <CardHeader>
          <CardTitle>{t('newAttribute')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AttributeForm
            siblings={product.attributes}
            pending={pending}
            onSubmit={onCreateAttribute}
          />
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * The condition, as the expression it is.
 *
 * Built outside JSX so `react/jsx-no-literals` stays on: the rule is right that a bare
 * string in a component is usually a missed translation, and `motorised = true` is the
 * exception — a key, an operator and a value, none of which are language.
 */
function showIfExpression(attribute: ProductDetail['attributes'][number]): string {
  return `${attribute.showIfAttributeKey} = ${attribute.showIfValue}`
}

function OptionForm({
  attributeId,
  pending,
  onSubmit,
}: {
  attributeId: string
  pending: boolean
  onSubmit: (input: Record<string, unknown>) => void
}) {
  const t = useTranslations('admin.catalog')
  const [value, setValue] = useState('')
  const [labelTr, setLabelTr] = useState('')
  const [labelEn, setLabelEn] = useState('')

  return (
    <form
      className="grid gap-md md:grid-cols-4"
      action={() => {
        onSubmit({
          attributeId,
          value,
          translations: { tr: { label: labelTr }, en: { label: labelEn } },
        })
        setValue('')
        setLabelTr('')
        setLabelEn('')
      }}
    >
      <Field
        id={`option-value-${attributeId}`}
        label={t('value')}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        required
      />
      <Field
        id={`option-label-tr-${attributeId}`}
        label={t('labelTr')}
        value={labelTr}
        onChange={(event) => setLabelTr(event.target.value)}
        required
      />
      <Field
        id={`option-label-en-${attributeId}`}
        label={t('labelEn')}
        value={labelEn}
        onChange={(event) => setLabelEn(event.target.value)}
        required
      />
      <div className="flex items-end">
        <Button type="submit" variant="confirm" size="dense" disabled={pending}>
          {pending ? t('saving') : t('newOption')}
        </Button>
      </div>
    </form>
  )
}

function AttributeForm({
  siblings,
  pending,
  onSubmit,
}: {
  siblings: ProductDetail['attributes']
  pending: boolean
  onSubmit: (input: Record<string, unknown>) => void
}) {
  const t = useTranslations('admin.catalog')
  const [key, setKey] = useState('')
  const [labelTr, setLabelTr] = useState('')
  const [labelEn, setLabelEn] = useState('')
  const [inputType, setInputType] = useState<'NUMBER' | 'SELECT' | 'MULTISELECT' | 'BOOL' | 'TEXT'>(
    'SELECT',
  )
  const [isRequired, setIsRequired] = useState(false)
  const [affectsPrice, setAffectsPrice] = useState(false)
  const [showIfKey, setShowIfKey] = useState('')
  const [showIfValue, setShowIfValue] = useState('')

  /*
   * Only unconditional siblings are offered as a `showIf` target. `ADR-008` allows one
   * level, and the service refuses a chain — offering the choice and then rejecting it
   * would be a worse way to say the same thing.
   */
  const targets = siblings.filter((sibling) => sibling.showIfAttributeKey === null)

  return (
    <form
      className="grid gap-md md:grid-cols-3"
      action={() => {
        onSubmit({
          key,
          inputType,
          isRequired,
          affectsPrice,
          showIfAttributeKey: showIfKey === '' ? null : showIfKey,
          showIfValue: showIfKey === '' ? null : showIfValue,
          translations: { tr: { label: labelTr }, en: { label: labelEn } },
        })
        setKey('')
        setLabelTr('')
        setLabelEn('')
        setShowIfKey('')
        setShowIfValue('')
      }}
    >
      <Field
        id="attribute-key"
        label={t('key')}
        hint={t('keyHint')}
        value={key}
        onChange={(event) => setKey(event.target.value)}
        required
      />
      <Field
        id="attribute-label-tr"
        label={t('labelTr')}
        value={labelTr}
        onChange={(event) => setLabelTr(event.target.value)}
        required
      />
      <Field
        id="attribute-label-en"
        label={t('labelEn')}
        value={labelEn}
        onChange={(event) => setLabelEn(event.target.value)}
        required
      />

      <div className="flex flex-col gap-xs">
        <Label htmlFor="attribute-type">{t('inputType')}</Label>
        <select
          id="attribute-type"
          className="h-11 rounded border border-control-border bg-panel px-sm text-body-md text-on-panel sm:h-10"
          value={inputType}
          onChange={(event) => setInputType(event.target.value as typeof inputType)}
        >
          {(['SELECT', 'MULTISELECT', 'NUMBER', 'BOOL', 'TEXT'] as const).map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-xs">
        <Label htmlFor="attribute-showif">{t('showIf')}</Label>
        <select
          id="attribute-showif"
          className="h-11 rounded border border-control-border bg-panel px-sm text-body-md text-on-panel sm:h-10"
          value={showIfKey}
          onChange={(event) => setShowIfKey(event.target.value)}
          aria-describedby="attribute-showif-hint"
        >
          <option value="">{t('showIfNone')}</option>
          {targets.map((sibling) => (
            <option key={sibling.id} value={sibling.key}>
              {sibling.key}
            </option>
          ))}
        </select>
        <p id="attribute-showif-hint" className="text-body-sm text-muted">
          {t('showIfHint')}
        </p>
      </div>

      <Field
        id="attribute-showif-value"
        label={t('showIfValue')}
        value={showIfValue}
        onChange={(event) => setShowIfValue(event.target.value)}
        disabled={showIfKey === ''}
      />

      <div className="flex items-center gap-base">
        <Checkbox
          id="attribute-required"
          checked={isRequired}
          onCheckedChange={(value) => setIsRequired(value === true)}
        />
        <Label htmlFor="attribute-required" className="normal-case">
          {t('required')}
        </Label>
      </div>

      <div className="flex items-center gap-base">
        <Checkbox
          id="attribute-affects-price"
          checked={affectsPrice}
          onCheckedChange={(value) => setAffectsPrice(value === true)}
        />
        <Label htmlFor="attribute-affects-price" className="normal-case">
          {t('affectsPrice')}
        </Label>
      </div>

      <div className="flex items-end">
        <Button type="submit" variant="confirm" size="dense" disabled={pending}>
          {pending ? t('saving') : t('newAttribute')}
        </Button>
      </div>
    </form>
  )
}
