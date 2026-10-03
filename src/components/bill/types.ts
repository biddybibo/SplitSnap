import type { LineKind } from '@/lib/reconcile'

export interface Item {
  name: string
  qty: number
  priceCents: number
  kind: LineKind
  flagged?: number
  flagNote?: string
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
  lockedAt?: string
  hostId: string
}

export interface ShareRow {
  userId: string
  subtotalCents: number
  feesCents: number
  taxCents: number
  tipCents: number
  adjustmentCents: number
  totalCents: number
}
