import { NOTIFICATION_EVENTS, type NotificationChannel, type NotificationType } from './catalog'

/**
 * One template per (event, locale) — `13` §Templates: in the repo, versioned, plain text,
 * no tracking pixels. Like `templates.ts`'s auth family, these are NOT next-intl messages:
 * a notification is composed on the server for a recipient whose locale is a column on
 * their row, not a URL segment.
 *
 * **The gate mechanism**: `TEMPLATES` is `Record<NotificationType, …>`. Add an event to
 * the catalogue without a template and `pnpm typecheck` fails — a pipeline stage — before
 * the catalogue test even runs. The test then renders every template with the catalogue's
 * `sample` payload and fails on emptiness or a leftover `{placeholder}`.
 *
 * Money never enters a payload as a float; anything monetary is formatted to a string from
 * kuruş before `notify()` is called (`13` §Templates).
 */

export type RenderedNotification = {
  /** In-app title and the email subject. */
  title: string
  /** In-app/email body, plain text. */
  body: string
  /** Only for events whose catalogue channels include 'sms' — short, single-segment-ish. */
  sms?: string
}

type Payload = Record<string, string | number>

const value = (payload: Payload, key: string): string => String(payload[key] ?? `{${key}}`)

type Locale = 'tr' | 'en'

type Renderer = (payload: Payload) => RenderedNotification

/** `subscription` rows render nothing; the type below makes that explicit. */
export const TEMPLATES: Record<NotificationType, Record<Locale, Renderer> | null> = {
  offer_request_created: {
    tr: (p) => ({
      title: 'Teklif isteğiniz gönderildi',
      body: `Projeniz ${value(p, 'companyCount')} üreticiye iletildi. Üreticiler 48 saat içinde yanıtlar; yanıtları Taleplerim sayfasından izleyebilirsiniz.`,
    }),
    en: (p) => ({
      title: 'Your offer request was sent',
      body: `Your project was sent to ${value(p, 'companyCount')} manufacturers. They respond within 48 hours; track the answers on My Requests.`,
    }),
  },
  offer_request_received: {
    tr: (p) => ({
      title: 'Yeni talep',
      body: `${value(p, 'cityName')} bölgesinden ${value(p, 'areaM2')} m²'lik yeni bir proje talebi aldınız. Yanıt süresi 48 saattir.`,
      sms: `Yeni proje talebi: ${value(p, 'cityName')}, ${value(p, 'areaM2')} m². 48 saat içinde yanıtlayın.`,
    }),
    en: (p) => ({
      title: 'New lead',
      body: `You received a new project request from ${value(p, 'cityName')} (${value(p, 'areaM2')} m²). The response window is 48 hours.`,
      sms: `New lead: ${value(p, 'cityName')}, ${value(p, 'areaM2')} m². Respond within 48h.`,
    }),
  },
  offer_request_sla_reminder: {
    tr: (p) => ({
      title: 'Talep yanıt süresi daralıyor',
      body: `Bekleyen bir talebiniz için yanıt süresinin dolmasına yaklaşık ${value(p, 'hoursLeft')} saat kaldı. Süre dolduğunda talep otomatik olarak reddedilir.`,
    }),
    en: (p) => ({
      title: 'Lead response window closing',
      body: `About ${value(p, 'hoursLeft')} hours remain to respond to a pending lead. When the window closes the request declines automatically.`,
    }),
  },
  contact_disclosed: {
    tr: (p) => ({
      title: 'İletişim bilgileriniz paylaşıldı',
      body: `Talebinizi kabul eden ${value(p, 'companyName')} ile adınız, e-posta adresiniz ve telefon numaranız, onayınıza dayanarak paylaşıldı. Bu bildirim, paylaşımın kaydıdır.`,
      sms: `${value(p, 'companyName')} talebinizi kabul etti; iletişim bilgileriniz onayınızla paylaşıldı.`,
    }),
    en: (p) => ({
      title: 'Your contact details were shared',
      body: `${value(p, 'companyName')} accepted your request; your name, email and phone number were shared with them under your consent. This notification is the record of that disclosure.`,
      sms: `${value(p, 'companyName')} accepted your request; your contact details were shared under your consent.`,
    }),
  },
  offer_request_declined: {
    tr: (p) => ({
      title: 'Talebiniz reddedildi',
      body: `${value(p, 'companyName')} talebinizi yanıtlayamayacağını bildirdi. Eşleşme sonuçlarınızdan başka üreticiler seçebilirsiniz.`,
    }),
    en: (p) => ({
      title: 'Your request was declined',
      body: `${value(p, 'companyName')} declined your request. You can select other manufacturers from your match results.`,
    }),
  },
  offer_request_expired: {
    tr: (p) => ({
      title: 'Talep süresi doldu',
      body: `${value(p, 'companyName')} ile aranızdaki talep, yanıt süresi içinde yanıtlanmadığı için kapandı. Başka üreticiler seçebilirsiniz.`,
    }),
    en: (p) => ({
      title: 'Request expired',
      body: `The request with ${value(p, 'companyName')} closed unanswered at the end of its window. You can select other manufacturers.`,
    }),
  },
  survey_scheduled: {
    tr: (p) => ({
      title: 'Keşif randevusu planlandı',
      body: `Keşif randevunuz ${value(p, 'when')} için planlandı. Değişiklik gerekirse talep sayfasından yazabilirsiniz.`,
    }),
    en: (p) => ({
      title: 'Survey appointment scheduled',
      body: `Your site survey is scheduled for ${value(p, 'when')}. If it needs to move, write from the request page.`,
    }),
  },
  appointment_reminder: {
    tr: (p) => ({
      title: 'Keşif randevusu hatırlatması',
      body: `Keşif randevunuz yaklaşıyor: ${value(p, 'when')}.`,
      sms: `Hatırlatma: keşif randevunuz ${value(p, 'when')}.`,
    }),
    en: (p) => ({
      title: 'Survey reminder',
      body: `Your site survey is coming up: ${value(p, 'when')}.`,
      sms: `Reminder: your site survey is at ${value(p, 'when')}.`,
    }),
  },
  offer_received: {
    tr: (p) => ({
      title: 'Yeni teklif geldi',
      body: `${value(p, 'companyName')} projeniz için teklif gönderdi. Teklif ${value(p, 'validUntil')} tarihine kadar geçerli. İlk tahmininizle yan yana görebilirsiniz.`,
      sms: `${value(p, 'companyName')} teklif gönderdi. Son geçerlilik: ${value(p, 'validUntil')}.`,
    }),
    en: (p) => ({
      title: 'New offer received',
      body: `${value(p, 'companyName')} sent an offer for your project, valid until ${value(p, 'validUntil')}. You can view it beside your original estimate.`,
      sms: `${value(p, 'companyName')} sent an offer. Valid until ${value(p, 'validUntil')}.`,
    }),
  },
  offer_revised: {
    tr: (p) => ({
      title: 'Teklif güncellendi',
      body: `${value(p, 'companyName')} teklifini güncelledi. Önceki sürüm de kayıtlarınızda görünür durumda.`,
    }),
    en: (p) => ({
      title: 'Offer revised',
      body: `${value(p, 'companyName')} revised their offer. The previous version stays visible in your records.`,
    }),
  },
  offer_expiring: {
    tr: (p) => ({
      title: 'Teklifin süresi dolmak üzere',
      body: `${value(p, 'companyName')} teklifinin geçerliliği ${value(p, 'validUntil')} tarihinde sona eriyor.`,
    }),
    en: (p) => ({
      title: 'Offer expiring soon',
      body: `The offer from ${value(p, 'companyName')} expires on ${value(p, 'validUntil')}.`,
    }),
  },
  offer_accepted: {
    tr: (p) => ({
      title: 'Teklifiniz kabul edildi',
      body: `${value(p, 'offerNumber')} numaralı teklifiniz müşteri tarafından kabul edildi.`,
      sms: `Teklifiniz kabul edildi: ${value(p, 'offerNumber')}.`,
    }),
    en: (p) => ({
      title: 'Your offer was accepted',
      body: `Your offer ${value(p, 'offerNumber')} was accepted by the customer.`,
      sms: `Offer accepted: ${value(p, 'offerNumber')}.`,
    }),
  },
  offer_rejected: {
    tr: (p) => ({
      title: 'Teklifiniz reddedildi',
      body: `${value(p, 'offerNumber')} numaralı teklifiniz müşteri tarafından reddedildi.`,
    }),
    en: (p) => ({
      title: 'Your offer was rejected',
      body: `Your offer ${value(p, 'offerNumber')} was rejected by the customer.`,
    }),
  },
  message_received: {
    tr: (p) => ({
      title: 'Yeni mesaj',
      body: `${value(p, 'senderName')} size bir mesaj gönderdi.`,
    }),
    en: (p) => ({
      title: 'New message',
      body: `${value(p, 'senderName')} sent you a message.`,
    }),
  },
  review_published: {
    tr: (p) => ({
      title: 'Yeni değerlendirme yayınlandı',
      body: `Profilinizde ${value(p, 'rating')} yıldızlı yeni bir değerlendirme yayınlandı. Dilerseniz yanıt yazabilirsiniz.`,
    }),
    en: (p) => ({
      title: 'New review published',
      body: `A new ${value(p, 'rating')}-star review was published on your profile. You can respond if you wish.`,
    }),
  },
  review_responded: {
    tr: (p) => ({
      title: 'Değerlendirmenize yanıt geldi',
      body: `${value(p, 'companyName')} değerlendirmenize yanıt yazdı.`,
    }),
    en: (p) => ({
      title: 'Your review got a response',
      body: `${value(p, 'companyName')} responded to your review.`,
    }),
  },
  review_rejected: {
    tr: (p) => ({
      title: 'Yorumunuz yayınlanamadı',
      body: `Yorumunuz, yayın kurallarımıza uymadığı için yayınlanamadı. Gerekçe: ${value(p, 'reason')}. Yorumunuzu düzenleyip yeniden gönderebilirsiniz; olumsuz bir değerlendirme tek başına ret gerekçesi değildir.`,
    }),
    en: (p) => ({
      title: 'Your review was not published',
      body: `Your review could not be published under our publication rules. Reason: ${value(p, 'reason')}. You can edit and resubmit it; a negative review is never, by itself, grounds for rejection.`,
    }),
  },
  company_verified: {
    tr: (p) => ({
      title: 'Firmanız doğrulandı',
      body: `${value(p, 'companyName')} doğrulandı. Artık eşleşmelerde görünür ve talep alabilirsiniz.`,
    }),
    en: (p) => ({
      title: 'Your company was verified',
      body: `${value(p, 'companyName')} is verified. You now appear in matches and can receive leads.`,
    }),
  },
  company_rejected: {
    tr: (p) => ({
      title: 'Doğrulama tamamlanamadı',
      body: `${value(p, 'companyName')} için doğrulama tamamlanamadı: ${value(p, 'reason')}. Belgelerinizi güncelleyip yeniden başvurabilirsiniz.`,
    }),
    en: (p) => ({
      title: 'Verification not completed',
      body: `Verification for ${value(p, 'companyName')} could not be completed: ${value(p, 'reason')}. You can update your documents and reapply.`,
    }),
  },
  price_book_published: {
    tr: (p) => ({
      title: 'Fiyat listeniz yayında',
      body: `Fiyat listenizin ${value(p, 'version')}. sürümü yayınlandı. Yeni tahminler bu sürümden hesaplanır.`,
    }),
    en: (p) => ({
      title: 'Your price book is live',
      body: `Version ${value(p, 'version')} of your price book was published. New estimates compute against it.`,
    }),
  },
  supply_gap_watch: null,
}

/** Render one notification for one recipient. Returns null for subscription rows. */
export function renderNotification(
  type: NotificationType,
  locale: Locale,
  payload: Payload,
): RenderedNotification | null {
  const family = TEMPLATES[type]
  if (family === null) return null
  return family[locale](payload)
}

/** The channels the catalogue grants this event — dispatch never invents one. */
export function channelsFor(type: NotificationType): readonly NotificationChannel[] {
  return NOTIFICATION_EVENTS[type].channels
}
