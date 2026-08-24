'use client'

import { useTranslations } from 'next-intl'

import { CONTACT_SHARING_TEXT_VERSION } from '@/shared/legal/consent-version'

/**
 * The contact-sharing consent — task 6.3, `19` §Consent, screen `ConsentCheckbox`
 * (`22` §Patterns).
 *
 * Rules the component itself holds:
 *
 *   **Never pre-checked** — `19` says so in one breath with "never bundled, never
 *   inferred". `checked` has no default and the parent starts it `false`.
 *
 *   **The version rides with the tick.** `onChange` hands back the `textVersion` actually
 *   rendered, and the service refuses any other — a tab left open across a text change
 *   re-renders and re-asks instead of recording consent to unseen words.
 *
 *   **Revocation is in the text**, not in a tooltip: consent stops future disclosures and
 *   cannot recall what was shared (`11` §Contact disclosure). The body says so plainly.
 */
export function ConsentCheckbox({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean, textVersion: string) => void
}) {
  const t = useTranslations('consent.contactSharing')

  return (
    <label className="flex items-start gap-base text-body-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked, CONTACT_SHARING_TEXT_VERSION)}
        className="mt-0.5"
        aria-describedby="consent-contact-sharing-body"
      />
      <span className="flex flex-col gap-xs">
        <span>{t('label')}</span>
        <span id="consent-contact-sharing-body" className="text-muted">
          {t('body')}
        </span>
      </span>
    </label>
  )
}
