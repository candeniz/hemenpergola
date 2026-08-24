import type { PrismaClient } from '@prisma/client'

/**
 * The three launch CMS pages — task 8.3, `18` §Content that has to exist at launch. In
 * every profile, because a nav link to a 404 advertises a page. The blocks satisfy the
 * closed union in `modules/content/domain/blocks.ts`; anything else would fail the
 * public read's parse and render the error state — which is the point.
 */

type Block =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'cta'; label: string; href: string }

const PAGES: { key: string; locale: string; title: string; blocks: Block[] }[] = [
  {
    key: 'nasil-calisir',
    locale: 'tr',
    title: 'Nasıl çalışır?',
    blocks: [
      {
        type: 'paragraph',
        text: 'Hemen Pergola, dış mekân mimari sistemleri için müşteri ile doğrulanmış üreticiyi buluşturur. Projenizi bir kez tanımlarsınız; size uyan üreticilerden karşılaştırılabilir teklifler alırsınız.',
      },
      { type: 'heading', level: 2, text: 'Üç adımda' },
      {
        type: 'list',
        items: [
          'Projenizi yapılandırın: ürün, ölçüler, seçenekler ve konum. Hesap gerekmez; taslağınız sizi bekler.',
          'Anında bir fiyat aralığı görün ve size uyan doğrulanmış üreticileri seçin (en fazla beş).',
          'Üretici talebinizi kabul ettiğinde iletişim açılır; keşif, karşılaştırmalı teklif ve karar aynı yerde ilerler.',
        ],
      },
      { type: 'heading', level: 2, text: 'Üreticiler için' },
      {
        type: 'paragraph',
        text: 'Belgeleriniz incelenir, hizmet bölgeleriniz ve fiyat listeniz size aittir. Talepler bölgenize ve ürünlerinize göre eşleşir; iletişim bilgisi ancak talebi kabul ettiğinizde paylaşılır.',
      },
      { type: 'cta', label: 'Projeni yapılandır', href: '/proje/yeni' },
    ],
  },
  {
    key: 'nasil-calisir',
    locale: 'en',
    title: 'How it works',
    blocks: [
      {
        type: 'paragraph',
        text: 'Hemen Pergola connects customers with verified manufacturers of outdoor architectural systems. Define your project once; receive comparable offers from manufacturers that fit it.',
      },
      { type: 'heading', level: 2, text: 'Three steps' },
      {
        type: 'list',
        items: [
          'Configure your project: product, dimensions, options and location. No account needed; your draft waits for you.',
          'See an instant price band and pick the verified manufacturers that fit (up to five).',
          'When a manufacturer accepts your request, contact opens; survey, comparable offer and decision proceed in one place.',
        ],
      },
      { type: 'heading', level: 2, text: 'For manufacturers' },
      {
        type: 'paragraph',
        text: 'Your documents are reviewed; your service areas and price book are yours. Requests match your region and products; contact details are shared only when you accept a request.',
      },
      { type: 'cta', label: 'Configure your project', href: '/proje/yeni' },
    ],
  },
  {
    key: 'hakkimizda',
    locale: 'tr',
    title: 'Hakkımızda',
    blocks: [
      {
        type: 'paragraph',
        text: 'Hemen Pergola, pergola, kış bahçesi ve cam sistemleri gibi dış mekân mimari ürünlerinde şeffaf fiyatlama ve doğrulanmış ustalık için kuruldu.',
      },
      {
        type: 'paragraph',
        text: 'Her üretici, belgeleri incelendikten sonra platformda yer alır. Her tahmin, üreticinin kendi yayımladığı fiyat listesinden hesaplanır. İletişim bilgileri yalnızca açık onayınızla ve talebiniz kabul edildiğinde paylaşılır.',
      },
    ],
  },
  {
    key: 'hakkimizda',
    locale: 'en',
    title: 'About us',
    blocks: [
      {
        type: 'paragraph',
        text: 'Hemen Pergola exists for transparent pricing and verified craftsmanship in outdoor architectural products — pergolas, winter gardens and glass systems.',
      },
      {
        type: 'paragraph',
        text: 'Every manufacturer joins after a document review. Every estimate is computed from the price book the manufacturer publishes. Contact details are shared only with your explicit consent, and only when your request is accepted.',
      },
    ],
  },
  {
    key: 'iletisim',
    locale: 'tr',
    title: 'Bize ulaşın',
    blocks: [
      {
        type: 'paragraph',
        text: 'Sorularınız için destek ekibimize yazabilirsiniz. Üreticiyseniz ve platforma katılmak istiyorsanız kayıt sayfasından başvurunuzu başlatabilirsiniz.',
      },
      { type: 'cta', label: 'Üretici olarak başvur', href: '/kayit' },
    ],
  },
  {
    key: 'iletisim',
    locale: 'en',
    title: 'Contact us',
    blocks: [
      {
        type: 'paragraph',
        text: 'Write to our support team with any question. If you are a manufacturer and want to join the platform, start your application from the registration page.',
      },
      { type: 'cta', label: 'Apply as a manufacturer', href: '/kayit' },
    ],
  },
]

export async function seedContent(prisma: PrismaClient): Promise<number> {
  for (const page of PAGES) {
    await prisma.contentPage.upsert({
      where: { key_locale: { key: page.key, locale: page.locale } },
      create: {
        key: page.key,
        locale: page.locale,
        title: page.title,
        blocks: page.blocks as object[],
      },
      update: { title: page.title, blocks: page.blocks as object[] },
    })
  }
  return PAGES.length
}
