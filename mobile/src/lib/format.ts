/**
 * Money: integer kuruş end to end (`ADR-005`). The ONLY place kuruş becomes a display
 * string or a typed TL string becomes kuruş — a second parser is a second rounding rule.
 */

const lira = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })

export function kurusToTl(kurus: number): string {
  return `₺${lira.format(Math.round(kurus / 100))}`
}

/** Band display (`ADR-006`): both bounds or nothing — never a single "price". */
export function formatBand(lowKurus: number | null, highKurus: number | null): string | null {
  if (lowKurus === null || highKurus === null) return null
  return `${kurusToTl(lowKurus)} – ${kurusToTl(highKurus)}`
}

/**
 * A typed TL amount → integer kuruş, or null when it is not a clean number. Accepts the
 * shapes people actually type: "12.500", "12500", "12500,50".
 */
export function tlToKurus(text: string): number | null {
  const normalised = text.trim().replaceAll('.', '').replace(',', '.')
  if (normalised === '' || !/^\d+(\.\d{1,2})?$/.test(normalised)) return null
  return Math.round(Number(normalised) * 100)
}

const dateTime = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul', // UTC in the database, Istanbul for display (CLAUDE.md).
})

export function formatWhen(value: string | Date): string {
  return dateTime.format(typeof value === 'string' ? new Date(value) : value)
}

/** Hours until the SLA dies — negative means it already did. */
export function hoursLeft(until: string | Date): number {
  const at = typeof until === 'string' ? new Date(until) : until
  return Math.floor((at.getTime() - Date.now()) / 3_600_000)
}
