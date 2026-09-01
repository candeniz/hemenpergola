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
 *
 * **Eleven more left in 13.8, and for the same reason** — they were links to 404s, which is
 * the identical failure one step worse: a link that is not merely a promise but a broken one.
 * `07` §Deferred screens carries each with its reason and `25` §Open questions names the
 * phase and the owner. They come back one at a time, each with its page:
 *
 *   no domain at all      `/hesap/kayitli-firmalar` (no `SavedCompany`),
 *                         `/yonetim/sikayetler` (no `Complaint`)
 *   no data to show       `/panel/[id]/analitik`, `/yonetim/metrikler`,
 *                         `/yonetim/pazar-fiyatlari` — the aggregates are not computed
 *   no service yet        `/hesap/talepler`, `/hesap/mesajlar` (both exist per-request,
 *                         neither has a cross-cutting list), `/yonetim/musteriler`
 *   built but not wired   `/panel/[id]/ekip` — every service exists (`listMembers`,
 *                         `inviteMember`, `changeMemberRole`, `removeMember`); it is next
 *   redundant             `/yonetim/bildirimler` — `/yonetim/ayarlar` is the
 *                         `PlatformSetting` surface and already holds these
 */
export type NavItem = {
  href: string
  labelKey: string
  icon: IconName
}

/*
 * Task 14.2 closed three more, and they were the worse kind: the page EXISTED and the link
 * missed it. `/degerlendirmeler` and `/yonetim/degerlendirmeler` were built as `yorumlar`,
 * `/yonetim/cms` as `/yonetim/icerik`. `nav-items.test.ts` now resolves every href against
 * `src/app` rather than against `07`'s route map, because a route map is a document and a
 * document can describe a page nobody built — which is how these survived from Phase 3.
 *
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
  { href: '/hesap/bildirimler', labelKey: 'notifications', icon: 'notifications' },
  { href: '/hesap/verilerim', labelKey: 'myData', icon: 'visibility' },
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
  { href: '/yorumlar', labelKey: 'reviews', icon: 'star' },
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
  { href: '/yonetim/talepler', labelKey: 'requests', icon: 'pending_actions' },
  { href: '/yonetim/katalog', labelKey: 'catalog', icon: 'inventory_2' },
  { href: '/yonetim/yorumlar', labelKey: 'reviews', icon: 'star' },
  { href: '/yonetim/icerik', labelKey: 'cms', icon: 'description' },
  { href: '/yonetim/denetim', labelKey: 'audit', icon: 'visibility' },
  { href: '/yonetim/ayarlar', labelKey: 'settings', icon: 'settings' },
]
