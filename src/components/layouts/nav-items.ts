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

/*
 * Task 8.3 closed the nav's 404s: `/urunler` (a listing that never existed — the route
 * map only has `/urunler/[slug]`) became `/kategoriler`, and `/projeler` (a portfolio
 * showcase nothing builds yet) became `/sehirler` — a real page with real supply behind
 * it. A link to a 404 advertises a page the same way a disabled link advertises a
 * feature.
 */
export const publicNav: readonly NavItem[] = [
  { href: '/kategoriler', labelKey: 'products', icon: 'inventory_2' },
  { href: '/nasil-calisir', labelKey: 'howItWorks', icon: 'info' },
  { href: '/ureticiler', labelKey: 'manufacturers', icon: 'factory' },
  { href: '/sehirler', labelKey: 'cities', icon: 'location_city' },
]

export const customerNav: readonly NavItem[] = [
  { href: '/hesap', labelKey: 'dashboard', icon: 'dashboard' },
  { href: '/hesap/projeler', labelKey: 'projects', icon: 'description' },
  { href: '/hesap/talepler', labelKey: 'requests', icon: 'pending_actions' },
  { href: '/hesap/mesajlar', labelKey: 'messages', icon: 'contact_support' },
  { href: '/hesap/kayitli-firmalar', labelKey: 'savedCompanies', icon: 'star' },
  { href: '/hesap/ayarlar', labelKey: 'settings', icon: 'settings' },
]

/**
 * The portal routes are `/panel/[companyId]/...` (`07` §Route map). These hrefs are the
 * **suffix** after the company id, so `''` is the dashboard; `manufacturerNavHref` joins
 * them. Storing the full path with a placeholder in it would mean every consumer doing string
 * replacement, and one of them eventually forgetting.
 */
export const manufacturerNav: readonly NavItem[] = [
  { href: '', labelKey: 'dashboard', icon: 'dashboard' },
  { href: '/talepler', labelKey: 'requests', icon: 'pending_actions' },
  { href: '/takvim', labelKey: 'calendar', icon: 'calendar_month' },
  { href: '/urunler', labelKey: 'products', icon: 'inventory_2' },
  { href: '/fiyatlandirma', labelKey: 'pricing', icon: 'payments' },
  { href: '/hizmet-bolgeleri', labelKey: 'serviceAreas', icon: 'home' },
  { href: '/portfoy', labelKey: 'portfolio', icon: 'description' },
  { href: '/degerlendirmeler', labelKey: 'reviews', icon: 'star' },
  { href: '/ekip', labelKey: 'team', icon: 'group' },
  { href: '/analitik', labelKey: 'analytics', icon: 'query_stats' },
  { href: '/ayarlar', labelKey: 'settings', icon: 'settings' },
]

/**
 * A portal link for one company.
 *
 * Every manufacturer route is company-scoped, so a link without an id is not a link that is
 * merely incomplete — it is a 404, or worse, a page that falls back to some other company.
 */
export function manufacturerNavHref(companyId: string, suffix: string): string {
  return `/panel/${companyId}${suffix}`
}

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
  { href: '/yonetim/ayarlar', labelKey: 'settings', icon: 'settings' },
]
