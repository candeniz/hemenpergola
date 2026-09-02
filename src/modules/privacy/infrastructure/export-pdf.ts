import 'server-only'

import { join } from 'node:path'

/**
 * The export's PDF half — `19` §Access: *"JSON + PDF"*. Task 9.1 shipped the JSON and
 * left this waiting on a font; Phase 9's last code pass closes it.
 *
 * **The font is embedded, and that is the whole difficulty.** A PDF's standard-14 faces
 * are WinAnsi-encoded and have no `ı İ ş Ş ğ Ğ` — a Turkish name would render as tofu, or
 * silently as the wrong letter, in the one document a person receives to check what we
 * hold about them. `fonts/noto-sans-tr-subset-*.ttf` (OFL 1.1, provenance and licence in
 * `fonts/LICENSE-noto-sans.md`) carries the repertoire; the integration test asserts a
 * round trip through this renderer preserves it.
 *
 * The PDF is a **readable summary**, not a second format of record: the JSON is the
 * complete, machine-readable copy the right of access requires, and this exists because a
 * person who asks what a company holds about them should not have to open a developer
 * tool to read the answer. Both are generated from the same package object, so they can
 * never disagree.
 */

type ExportPackage = {
  exportedAt?: unknown
  profile?: Record<string, unknown>
  consents?: unknown[]
  projects?: unknown[]
  offerRequests?: unknown[]
  reviews?: unknown[]
  messagesSent?: unknown[]
  notificationPreferences?: unknown[]
  notifications?: unknown[]
  devices?: unknown[]
}

const FONT_DIR = join(process.cwd(), 'src', 'app', '[locale]', 'fonts')

function line(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (value instanceof Date) return value.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export async function renderExportPdf(pkg: ExportPackage): Promise<Uint8Array> {
  const { default: PDFDocument } = await import('pdfkit')

  const doc = new PDFDocument({ size: 'A4', margin: 56, autoFirstPage: true })
  doc.registerFont('tr', join(FONT_DIR, 'noto-sans-tr-subset-regular.ttf'))
  doc.registerFont('tr-bold', join(FONT_DIR, 'noto-sans-tr-subset-bold.ttf'))

  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))
  const finished = new Promise<void>((resolve) => doc.on('end', () => resolve()))

  const heading = (text: string) => {
    doc.moveDown(0.8).font('tr-bold').fontSize(13).text(text)
    doc.font('tr').fontSize(10)
  }

  doc.font('tr-bold').fontSize(18).text('Kişisel veri dışa aktarımı')
  doc.font('tr').fontSize(10)
  doc.moveDown(0.3).text(`Hemen Pergola · ${line(pkg.exportedAt)}`)
  doc
    .moveDown(0.5)
    .text(
      'Bu belge, hesabınızla ilgili tuttuğumuz kişisel verilerin okunabilir bir özetidir. ' +
        'Aynı paketin makine tarafından okunabilir tam kopyası JSON dosyasındadır.',
    )

  heading('Hesap')
  for (const [key, value] of Object.entries(pkg.profile ?? {})) {
    doc.text(`${key}: ${line(value)}`)
  }

  heading('Onaylar')
  const consents = pkg.consents ?? []
  if (consents.length === 0) doc.text('Kayıt yok.')
  for (const consent of consents) {
    const row = consent as Record<string, unknown>
    doc.text(`${line(row.type)} · ${line(row.textVersion)} · ${line(row.grantedAt)}`)
  }

  heading('Projeler')
  const projects = pkg.projects ?? []
  if (projects.length === 0) doc.text('Kayıt yok.')
  for (const project of projects) {
    const row = project as Record<string, unknown>
    doc.text(`${line(row.product)} · ${line(row.city)} · ${line(row.status)}`)
    if (row.note !== null && row.note !== undefined) doc.text(`   Not: ${line(row.note)}`)
  }

  heading('Teklif talepleri')
  const requests = pkg.offerRequests ?? []
  if (requests.length === 0) doc.text('Kayıt yok.')
  for (const request of requests) {
    const row = request as Record<string, unknown>
    doc.text(`${line(row.company)} · ${line(row.status)} · ${line(row.createdAt)}`)
    // Totals only — never line items (`ADR-006` holds in every format).
    for (const offer of (row.offers ?? []) as Record<string, unknown>[]) {
      doc.text(`   Teklif ${line(offer.number)} · brüt ${line(offer.grossKurus)} kuruş`)
    }
  }

  heading('Yorumlarınız')
  const reviews = pkg.reviews ?? []
  if (reviews.length === 0) doc.text('Kayıt yok.')
  for (const review of reviews) {
    const row = review as Record<string, unknown>
    doc.text(`${line(row.ratingOverall)}/5 · ${line(row.status)} · ${line(row.title)}`)
  }

  heading('Gönderdiğiniz mesajlar')
  const messages = pkg.messagesSent ?? []
  if (messages.length === 0) doc.text('Kayıt yok.')
  for (const message of messages) {
    const row = message as Record<string, unknown>
    doc.text(`${line(row.sentAt)} — ${line(row.body)}`)
  }

  heading('Bildirim tercihleriniz')
  const preferences = pkg.notificationPreferences ?? []
  // Absence of a row means enabled (`13` §Preferences), so an empty list is an answer and
  // says so rather than looking like missing data.
  if (preferences.length === 0) doc.text('Kayıtlı tercih yok — hepsi açık.')
  for (const preference of preferences) {
    const row = preference as Record<string, unknown>
    doc.text(
      `${line(row.type)} · ${line(row.channel)} · ${row.enabled === true ? 'açık' : 'kapalı'}`,
    )
  }

  heading('Size gönderilen bildirimler')
  const notifications = pkg.notifications ?? []
  if (notifications.length === 0) doc.text('Kayıt yok.')
  for (const notification of notifications) {
    const row = notification as Record<string, unknown>
    // The rendered title and body — what the person actually received (14.6). The type is
    // kept beside it as the machine name, which is what a support conversation quotes.
    doc.text(
      `${line(row.createdAt)} · ${row.readAt === null ? 'okunmadı' : 'okundu'} · ${line(row.type)}`,
    )
    if (row.title !== null && row.title !== undefined) doc.text(`   ${line(row.title)}`)
    if (row.body !== null && row.body !== undefined) doc.text(`   ${line(row.body)}`)
  }

  heading('Kayıtlı cihazlarınız')
  const devices = pkg.devices ?? []
  if (devices.length === 0) doc.text('Kayıt yok.')
  for (const device of devices) {
    const row = device as Record<string, unknown>
    doc.text(
      `${line(row.platform)} · kayıt ${line(row.createdAt)} · son görülme ${line(row.lastSeenAt)}`,
    )
  }
  if (devices.length > 0) {
    // Says out loud what was left out and why — a redaction nobody is told about reads as
    // an omission (`19` §Export).
    doc.text(
      'Cihaz adresi (push jetonu) güvenlik gerekçesiyle bu dosyaya yazılmaz; jetonu bilen ' +
        'o cihaza bildirim gönderebilir.',
    )
  }

  doc.end()
  await finished
  return new Uint8Array(Buffer.concat(chunks))
}
