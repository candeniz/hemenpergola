import type { IconName } from '@/components/ui/icon'

/**
 * Navigation definitions. `labelKey` is a message key, never a string — `I18N-01`.
 *
 * The routes come from `07-frontend-architecture.md` §Route map. Pages for most of them
 * arrive with their phase; the shells link to them now so the information architecture is
 * visible and reviewable.
 *
 * Deliberately absent: plan management, subscriptions oversight, invoices/transactions and
 * the configurator builder. Those screens exist as designs and are not built (`ADR-010`,
 * `ADR-008`). A disabled link would be worse than no link — it advertises a feature.
 */
export type NavItem = {
  href: string
  labelKey: string
  icon: IconName
}

export const publicNav: readonly NavItem[] = [
  { href: '/urunler', labelKey: 'products', icon: 'inventory_2' },
  { href: '/nasil-calisir', labelKey: 'howItWorks', icon: 'info' },
  { href: '/ureticiler', labelKey: 'manufacturers', icon: 'factory' },
  { href: '/projeler', labelKey: 'projects', icon: 'description' },
]

export const customerNav: readonly NavItem[] = [
  { href: '/hesap', labelKey: 'dashboard', icon: 'dashboard' },
  { href: '/hesap/projeler', labelKey: 'projects', icon: 'description' },
  { href: '/hesap/talepler', labelKey: 'requests', icon: 'pending_actions' },
  { href: '/hesap/mesajlar', labelKey: 'messages', icon: 'contact_support' },
  { href: '/hesap/kayitli-firmalar', labelKey: 'savedCompanies', icon: 'star' },
  { href: '/hesap/ayarlar', labelKey: 'settings', icon: 'settings' },
]

export const manufacturerNav: readonly NavItem[] = [
  { href: '/panel', labelKey: 'dashboard', icon: 'dashboard' },
  { href: '/panel/talepler', labelKey: 'requests', icon: 'pending_actions' },
  { href: '/panel/takvim', labelKey: 'calendar', icon: 'calendar_month' },
  { href: '/panel/urunler', labelKey: 'products', icon: 'inventory_2' },
  { href: '/panel/fiyatlandirma', labelKey: 'pricing', icon: 'payments' },
  { href: '/panel/hizmet-bolgeleri', labelKey: 'serviceAreas', icon: 'home' },
  { href: '/panel/portfoy', labelKey: 'portfolio', icon: 'description' },
  { href: '/panel/degerlendirmeler', labelKey: 'reviews', icon: 'star' },
  { href: '/panel/ekip', labelKey: 'team', icon: 'group' },
  { href: '/panel/analitik', labelKey: 'analytics', icon: 'query_stats' },
  { href: '/panel/ayarlar', labelKey: 'settings', icon: 'settings' },
]

export const adminNav: readonly NavItem[] = [
  { href: '/yonetim', labelKey: 'dashboard', icon: 'dashboard' },
  { href: '/yonetim/ureticiler', labelKey: 'manufacturers', icon: 'factory' },
  { href: '/yonetim/musteriler', labelKey: 'customers', icon: 'group' },
  { href: '/yonetim/talepler', labelKey: 'requests', icon: 'pending_actions' },
  { href: '/yonetim/katalog', labelKey: 'catalog', icon: 'inventory_2' },
  { href: '/yonetim/degerlendirmeler', labelKey: 'reviews', icon: 'star' },
  { href: '/yonetim/sikayetler', labelKey: 'complaints', icon: 'warning' },
  { href: '/yonetim/cms', labelKey: 'cms', icon: 'description' },
  { href: '/yonetim/bildirimler', labelKey: 'notifications', icon: 'notifications' },
  { href: '/yonetim/denetim', labelKey: 'audit', icon: 'visibility' },
  { href: '/yonetim/metrikler', labelKey: 'metrics', icon: 'query_stats' },
  { href: '/yonetim/pazar-fiyatlari', labelKey: 'marketPricing', icon: 'payments' },
]
