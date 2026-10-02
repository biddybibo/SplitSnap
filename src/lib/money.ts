const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** 1299 → "$12.99"; -200 → "-$2.00". Money is integer cents everywhere. */
export function formatCents(cents: number): string {
  return usd.format(cents / 100)
}
