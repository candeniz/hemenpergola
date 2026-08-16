'use client'

import { useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'

import { Icon } from '@/components/ui/icon'

/**
 * Changing which company the portal is showing — `12` §Context resolution.
 *
 * Scope lives in the URL, so switching company is a **navigation** rather than a state
 * change: the same path is re-entered under a different id. That is what makes two tabs on
 * two companies work, and it is why this is a `<select>` that navigates rather than a store
 * that other components read.
 *
 * The path suffix is preserved where it can be — a manufacturer on "pricing" for one company
 * lands on "pricing" for the other, which is what they meant.
 */
export function CompanySwitcher({
  companies,
  currentCompanyId,
}: {
  companies: readonly { companyId: string; displayName: string; status: string }[]
  currentCompanyId: string
}) {
  const t = useTranslations('shell')
  const router = useRouter()
  const pathname = usePathname()

  // A single company is not a choice. Rendering a one-option dropdown asks the manufacturer
  // to consider something that has no alternative.
  if (companies.length <= 1) {
    const only = companies[0]
    return (
      <span className="font-heading text-body-md">
        {only?.displayName ?? t('placeholderCompany')}
      </span>
    )
  }

  const suffix = pathname.replace(/^\/panel\/[^/]+/, '')

  return (
    <label className="flex flex-col gap-0.5">
      <span className="sr-only">{t('companySwitcherLabel')}</span>
      <span className="flex items-center gap-xs">
        <select
          value={currentCompanyId}
          onChange={(event) => router.push(`/panel/${event.target.value}${suffix}`)}
          className="min-h-11 w-full rounded-sm bg-panel font-heading text-body-md text-on-panel"
        >
          {companies.map((company) => (
            <option key={company.companyId} value={company.companyId}>
              {company.displayName}
            </option>
          ))}
        </select>
        <Icon name="expand_more" dense className="text-muted" />
      </span>
    </label>
  )
}
