import { cn } from '@/lib/utils'

/**
 * Material Symbols Outlined, the only icon set in the system (22 §Component base).
 * The glyph is a ligature: `<Icon name="dashboard" />` renders the dashboard symbol.
 *
 * A name that is not in the subsetted font renders as its literal text, which is
 * deliberately loud — see `src/app/[locale]/fonts/README.md` for how to add one.
 */
export type IconName =
  | 'account_circle'
  | 'add'
  | 'arrow_back'
  | 'arrow_forward'
  | 'calendar_month'
  | 'check'
  | 'check_circle'
  | 'chevron_left'
  | 'chevron_right'
  | 'close'
  | 'contact_support'
  | 'dashboard'
  | 'delete'
  | 'description'
  | 'edit'
  | 'error'
  | 'expand_more'
  | 'factory'
  | 'group'
  | 'home'
  | 'info'
  | 'inventory_2'
  | 'language'
  | 'logout'
  | 'menu'
  | 'more_vert'
  | 'notifications'
  | 'payments'
  | 'pending_actions'
  | 'query_stats'
  | 'search'
  | 'settings'
  | 'star'
  | 'storefront'
  | 'upload'
  | 'visibility'
  | 'warning'

export function Icon({
  name,
  dense = false,
  className,
}: {
  name: IconName
  /** 20px instead of 24px, for the high-density portal and admin shells. */
  dense?: boolean
  className?: string
}) {
  return (
    <span aria-hidden className={cn('icon', dense && 'icon-dense', className)}>
      {name}
    </span>
  )
}
