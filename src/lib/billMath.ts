/**
 * Everything the bill screens derive from the raw rows, in one place: the
 * reconcile check, the claimable lines, who claimed what, and everyone's share.
 * Pure, so the claim screen, review screen, preview and invite sheet can't drift
 * apart — and lockBill runs the same reconcile + computeShares on the server.
 */

import { claimsByLine, type ClaimRow, type LineClaims } from './claims'
import { computeShares, type Share } from './computeShares'
import { reconcile, type LineKind } from './reconcile'

export interface BillItem {
  recordId: string
  data: { name: string; qty?: number; priceCents: number; kind: LineKind }
}

export interface PrintedReceipt {
  printedSubtotalCents?: number | null
  printedTotalCents: number
  printedTipCents?: number
  chargedCents?: number | null
  hostId: string
}

export interface ClaimableLine {
  id: string
  name: string
  priceCents: number
  qty: number
}

export interface BillMath {
  check: ReturnType<typeof reconcile>
  claimable: ClaimableLine[]
  byLine: Map<string, LineClaims>
  shares: Share[]
}

export function billMath(items: BillItem[], receipt: PrintedReceipt, claims: ClaimRow[]): BillMath {
  const lines = items.map((i) => ({ id: i.recordId, kind: i.data.kind, priceCents: i.data.priceCents }))
  const check = reconcile(lines, {
    printedSubtotalCents: receipt.printedSubtotalCents ?? null,
    printedTotalCents: receipt.printedTotalCents,
    printedTipCents: receipt.printedTipCents ?? 0,
    chargedCents: receipt.chargedCents ?? null,
  })
  const claimable = items
    .filter((i) => i.data.kind === 'item' || i.data.kind === 'discount')
    .map((i) => ({ id: i.recordId, name: i.data.name, priceCents: i.data.priceCents, qty: Math.max(1, i.data.qty ?? 1) }))
  const byLine = claimsByLine(claimable, claims)
  const shares = computeShares(
    lines,
    claims.map((c) => ({ itemId: c.itemId, userId: c.userId, units: c.units ?? null })),
    receipt.hostId,
  )
  return { check, claimable, byLine, shares }
}
