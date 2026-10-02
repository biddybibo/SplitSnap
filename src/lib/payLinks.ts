/**
 * Prefilled pay links to the host. SplitSnap never moves money: these open the
 * payment app with the amount and a note filled in, and the person confirms there.
 * Handles were cleaned on save (cleanHandle), and are encoded again here.
 */

export interface PayHandles {
  payVenmo?: string
  payCashApp?: string
  payPaypal?: string
}

export interface PayLink {
  app: 'Venmo' | 'Cash App' | 'PayPal'
  href: string
}

const SAFE = /^[A-Za-z0-9_.-]{1,30}$/

export function payLinks(handles: PayHandles, amountCents: number, note: string): PayLink[] {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return []
  const amount = (amountCents / 100).toFixed(2)
  const links: PayLink[] = []
  const v = handles.payVenmo
  if (v && SAFE.test(v)) {
    links.push({
      app: 'Venmo',
      href: `https://venmo.com/?txn=pay&recipients=${encodeURIComponent(v)}&amount=${amount}&note=${encodeURIComponent(note)}`,
    })
  }
  const c = handles.payCashApp
  if (c && SAFE.test(c)) links.push({ app: 'Cash App', href: `https://cash.app/$${encodeURIComponent(c)}/${amount}` })
  const p = handles.payPaypal
  if (p && SAFE.test(p)) links.push({ app: 'PayPal', href: `https://paypal.me/${encodeURIComponent(p)}/${amount}USD` })
  return links
}
