/**
 * Receipt dates. `printedAt` is what the AI read off the receipt: local
 * "YYYY-MM-DDTHH:MM", or date-only "YYYY-MM-DD". A bare date parses as UTC
 * midnight (the previous evening in the US), so pin it to local midnight.
 */

export function parsePrintedAt(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const d = new Date(raw.length === 10 ? `${raw}T00:00` : raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "Today" or "Oct 4" — for bill lists and the join preview. */
export function shortDay(d: Date | null, now = new Date()): string {
  if (!d) return ''
  if (d.toDateString() === now.toDateString()) return 'Today'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "Oct 4, 2026, 7:30 PM" (time only when the receipt printed one) — for the review header. */
export function receiptStamp(raw: string | null | undefined): string {
  const d = parsePrintedAt(raw)
  if (!d || !raw) return ''
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(raw.length > 10 ? { hour: 'numeric', minute: '2-digit' } : {}),
  })
}
