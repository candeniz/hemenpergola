'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useTransition } from 'react'

import { Icon } from '@/components/ui/icon'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { cn } from '@/lib/utils'

/** Switches locale on the current path. `tr` is unprefixed, `en` is prefixed. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations('common')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  return (
    <div className={cn('flex items-center gap-xs', className)}>
      <Icon name="language" dense className="text-muted" />
      <span className="sr-only">{t('language')}</span>
      {routing.locales.map((code) => (
        <button
          key={code}
          type="button"
          disabled={isPending}
          aria-current={code === locale ? 'true' : undefined}
          className={cn(
            'min-h-11 rounded-sm px-base text-label-md uppercase',
            code === locale ? 'text-action' : 'text-muted hover:text-on-panel',
          )}
          onClick={() => {
            startTransition(() => {
              router.replace(pathname, { locale: code })
            })
          }}
        >
          {code}
        </button>
      ))}
    </div>
  )
}
