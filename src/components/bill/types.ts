import type { LineKind } from '@/lib/reconcile'

export interface Item {
  name: string
  qty: number
  priceCents: number
  kind: LineKind
  hostId: string
}

export interface ReceiptRow {
  merchant: string
  printedSubtotalCents: number | null
  printedTotalCents: number
  printedTipCents?: number
  chargedCents?: number | null
  receiptNumber?: string
  printedAt?: string
  imageId?: string
  payVenmo?: string
  payCashApp?: string
  payPaypal?: string
  hostId: string
}
