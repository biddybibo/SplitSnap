const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** 1299 → "$12.99"; -200 → "-$2.00". Money is integer cents everywhere. */
export function formatCents(cents: number): string {
  return usd.format(cents / 100)
}

/**
 * Parses what a person types into a price field: "12", "12.5", "$12.50", "-2", "1,299.00".
 * Returns integer cents, or null if it isn't a valid amount (more than 2 decimals, letters, empty).
 */
export function parseDollars(input: string): number | null {
  const s = input.trim().replace(/[$,\s]/g, '')
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(s) ?? /^(-)?()\.(\d{1,2})$/.exec(s)
  if (!m) return null
  const cents = Number(m[2] || '0') * 100 + Number((m[3] ?? '').padEnd(2, '0') || '0')
  return m[1] ? -cents : cents
}
