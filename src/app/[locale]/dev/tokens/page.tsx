import { getTranslations, setRequestLocale } from 'next-intl/server'

import { Badge } from '@/components/ui/badge'
import { Icon, type IconName } from '@/components/ui/icon'
import { checkContrast, type ContrastRequirement } from '@/lib/contrast'
import { contrastPairs, palette, semanticTokens, statusTones } from '@/lib/design-tokens'

/**
 * 22-design-system.md §Tokens, rendered — the artefact task 0.9 asks for. Everything here
 * reads from `src/lib/design-tokens.ts`, which `design-tokens.test.ts` pins to
 * `globals.css`, so this page cannot drift from what the components actually use.
 */

const typeScale = [
  {
    name: 'display-lg',
    className: 'text-display-lg font-heading',
    spec: 'Montserrat 700 · 48/56 · -0.02em',
  },
  {
    name: 'headline-lg',
    className: 'text-headline-lg font-heading',
    spec: 'Montserrat 600 · 32/40',
  },
  {
    name: 'headline-lg-mobile',
    className: 'text-headline-lg-mobile font-heading',
    spec: 'Montserrat 600 · 24/32',
  },
  {
    name: 'headline-md',
    className: 'text-headline-md font-heading',
    spec: 'Montserrat 600 · 24/32',
  },
  { name: 'body-lg', className: 'text-body-lg', spec: 'Inter 400 · 18/28' },
  { name: 'body-md', className: 'text-body-md', spec: 'Inter 400 · 16/24' },
  { name: 'body-sm', className: 'text-body-sm', spec: 'Inter 400 · 14/20' },
  { name: 'label-md', className: 'text-label-md uppercase', spec: 'Inter 600 · 12/16 · +0.05em' },
] as const

const spacingScale = [
  { name: 'xs', px: 4, className: 'w-xs' },
  { name: 'base', px: 8, className: 'w-base' },
  { name: 'sm', px: 12, className: 'w-sm' },
  { name: 'md', px: 24, className: 'w-md' },
  { name: 'lg', px: 48, className: 'w-lg' },
  { name: 'xl', px: 80, className: 'w-xl' },
] as const

const radiusScale = [
  { name: 'sm', value: '0.25rem', className: 'rounded-sm' },
  { name: 'DEFAULT', value: '0.5rem', className: 'rounded' },
  { name: 'md', value: '0.75rem', className: 'rounded-md' },
  { name: 'lg', value: '1rem', className: 'rounded-lg' },
  { name: 'xl', value: '1.5rem', className: 'rounded-xl' },
  { name: 'full', value: '9999px', className: 'rounded-full' },
] as const

/** Turkish glyphs, so a font fallback is visible rather than assumed (task 0.10). */
const TURKISH_PANGRAM = 'Pijamalı hasta yağız şoföre çabucak güvendi — ĞİIıŞşÇçÖöÜü'

const iconSample: readonly IconName[] = [
  'dashboard',
  'pending_actions',
  'payments',
  'factory',
  'group',
  'inventory_2',
  'calendar_month',
  'query_stats',
  'star',
  'settings',
  'notifications',
  'warning',
]

function requirementLabel(requirement: ContrastRequirement): string {
  switch (requirement) {
    case 'text':
      return '4.5:1 · text'
    case 'large-text':
      return '3:1 · large text'
    case 'ui':
      return '3:1 · UI boundary'
    case 'decorative':
      return 'n/a · decorative'
  }
}

export default async function TokensPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'dev' })

  const results = contrastPairs.map((pair) => ({
    ...pair,
    result: checkContrast(palette[pair.foreground], palette[pair.background], pair.requirement),
  }))

  const audited = results.filter((row) => row.requirement !== 'decorative')
  const failing = audited.filter((row) => !row.result.passes)

  return (
    <main className="mx-auto flex max-w-page flex-col gap-xl px-margin-mobile py-lg md:px-margin-desktop">
      <header className="flex flex-col gap-xs">
        <h1 className="font-heading text-headline-lg">{t('tokensTitle')}</h1>
        <p className="text-body-md text-muted">{t('tokensBody')}</p>
      </header>

      {/* ---- Contrast audit, first: it is the part that can fail ---- */}
      <section className="flex flex-col gap-sm">
        <h2 className="font-heading text-headline-md">{t('contrast')}</h2>
        <p className="max-w-3xl text-body-sm text-muted">{t('contrastBody')}</p>

        <p className="text-body-md">
          <Badge tone={failing.length === 0 ? 'new' : 'cancelled'}>
            {failing.length === 0
              ? `${audited.length}/${audited.length} ${t('pass')}`
              : `${failing.length} ${t('fail')}`}
          </Badge>
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead className="bg-panel-subtle">
              <tr className="h-row">
                <th className="px-sm text-left text-label-md uppercase text-muted">{t('pair')}</th>
                <th className="px-sm text-left text-label-md uppercase text-muted">
                  {t('requirement')}
                </th>
                <th className="px-sm text-right text-label-md uppercase text-muted">
                  {t('ratio')}
                </th>
                <th className="px-sm text-left text-label-md uppercase text-muted" />
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {results.map((row) => (
                <tr key={row.label} className="h-row">
                  <td className="px-sm">
                    {/*
                      Decorative: the row already states the pair, the threshold, the
                      measured ratio and the verdict in text. Hidden from assistive tech
                      because several of these swatches are *deliberately* failing or
                      exempt pairs — this page's job is to show them, and axe is right to
                      flag them if they are exposed.
                    */}
                    <span
                      aria-hidden

                      data-contrast-sample
                      className="mr-base inline-flex items-center rounded-sm px-base py-xs text-label-md"
                      style={{
                        backgroundColor: palette[row.background],
                        color: palette[row.foreground],
                      }}
                    >
                      Aa
                    </span>
                    {row.label}
                  </td>
                  <td className="px-sm text-muted">{requirementLabel(row.requirement)}</td>
                  <td className="px-sm text-right tabular-nums">{row.result.ratio.toFixed(2)}</td>
                  <td className="px-sm">
                    {row.requirement === 'decorative' ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <Badge tone={row.result.passes ? 'new' : 'cancelled'}>
                        {row.result.passes ? t('pass') : t('fail')}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- Status badges ---- */}
      <section className="flex flex-col gap-sm">
        <h2 className="font-heading text-headline-md">{t('statusBadges')}</h2>
        <div className="flex flex-wrap items-center gap-sm">
          {statusTones.map((tone) => (
            <div key={tone.tone} className="flex flex-col gap-xs">
              <Badge tone={tone.tone}>{tone.tone}</Badge>
              <span className="text-body-sm text-muted">{tone.statuses}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Semantic names ---- */}
      <section className="flex flex-col gap-sm">
        <h2 className="font-heading text-headline-md">{t('semantic')}</h2>
        <ul className="grid gap-sm sm:grid-cols-2 lg:grid-cols-3">
          {semanticTokens.map((token) => (
            <li key={token.name} className="flex items-center gap-sm">
              <span
                className="size-10 shrink-0 rounded border border-divider"
                style={{ backgroundColor: palette[token.token] }}
              />
              <span className="flex flex-col">
                <code className="text-body-sm">{token.name}</code>
                <span className="text-body-sm text-muted">
                  {token.token} · {token.use}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Full palette ---- */}
      <section className="flex flex-col gap-sm">
        <h2 className="font-heading text-headline-md">{t('palette')}</h2>
        <ul className="grid gap-base sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(palette).map(([name, value]) => (
            <li key={name} className="flex items-center gap-base">
              <span
                className="size-10 shrink-0 rounded border border-divider"
                style={{ backgroundColor: value }}
              />
              <span className="flex min-w-0 flex-col">
                <code className="truncate text-body-sm">{name}</code>
                <code className="text-body-sm uppercase text-muted">{value}</code>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Typography ---- */}
      <section className="flex flex-col gap-sm">
        <h2 className="font-heading text-headline-md">{t('typography')}</h2>
        <ul className="flex flex-col gap-md">
          {typeScale.map((style) => (
            <li key={style.name} className="flex flex-col gap-xs border-b border-divider pb-sm">
              <span className="text-label-md uppercase text-muted">
                {style.name} · {style.spec}
              </span>
              <span className={style.className}>{TURKISH_PANGRAM}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Icons ---- */}
      <section className="flex flex-col gap-sm">
        <h2 className="font-heading text-headline-md">{t('icons')}</h2>
        <ul className="flex flex-wrap gap-md">
          {iconSample.map((name) => (
            <li key={name} className="flex w-24 flex-col items-center gap-xs">
              <Icon name={name} />
              <code className="text-center text-body-sm text-muted">{name}</code>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Spacing, radius, elevation ---- */}
      <section className="grid gap-lg lg:grid-cols-3">
        <div className="flex flex-col gap-sm">
          <h2 className="font-heading text-headline-md">{t('spacing')}</h2>
          <ul className="flex flex-col gap-base">
            {spacingScale.map((step) => (
              <li key={step.name} className="flex items-center gap-base">
                <span className={`${step.className} h-4 rounded-sm bg-action`} />
                <code className="text-body-sm text-muted">
                  {step.name} · {step.px}px
                </code>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-sm">
          <h2 className="font-heading text-headline-md">{t('radius')}</h2>
          <ul className="flex flex-wrap gap-base">
            {radiusScale.map((step) => (
              <li key={step.name} className="flex flex-col items-center gap-xs">
                <span
                  className={`${step.className} size-16 border border-control-border bg-panel`}
                />
                <code className="text-body-sm text-muted">{step.name}</code>
                <code className="text-body-sm text-muted">{step.value}</code>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-sm">
          <h2 className="font-heading text-headline-md">{t('elevation')}</h2>
          <div className="rounded-lg bg-panel p-md shadow-ambient">
            <code className="text-body-sm text-muted">shadow-ambient</code>
          </div>
          <div className="rounded border border-divider bg-panel p-md">
            <code className="text-body-sm text-muted">border-divider (dense surfaces)</code>
          </div>
        </div>
      </section>
    </main>
  )
}
