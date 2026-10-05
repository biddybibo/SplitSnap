/**
 * lockBill — host-only. Freezes the split: refuses unless every claimable line
 * has a claimant and the bill reconciles, then writes everyone's `shares` with
 * computeShares (the same function the claim screen previews with), stamps
 * `receipt.lockedAt`, and marks the bill locked in the app-room index.
 *
 * Writes are idempotent (shares are keyed by person), so a retry after a partial
 * failure converges instead of duplicating.
 */

import type { ActionHandler } from 'deepspace/worker'
import { computeShares, type ShareClaim, type ShareLine } from '../lib/computeShares'
import { reconcile, type LineKind } from '../lib/reconcile'
import { requireHost } from '../server/bill-access'
import type { Env } from '../../worker'

type ItemRow = { kind: LineKind; priceCents: number; qty?: number; name?: string }
type ClaimRow = { itemId: string; userId: string; units?: number | null }
type GuestClaimRow = { itemId: string; guestId: string; units?: number | null }
type ReceiptRow = {
  printedSubtotalCents: number | null
  printedTotalCents: number
  printedTipCents?: number
  chargedCents?: number | null
  lockedAt?: string
}

const ALL = { limit: 1000 }

export const lockBill: ActionHandler<Env> = async (ctx) => {
  const { userId, tools } = ctx
  const host = await requireHost(ctx, ctx.params.billId, { action: 'lock the bill', allowLocked: true })
  if (!host.ok) return { success: false, error: host.error }
  if (host.lockedAt) return { success: false, error: 'This bill is already locked' }
  const { billId, room: billTools } = host

  const [receipt, items, claims, guestClaims] = await Promise.all([
    billTools.get<ReceiptRow>('receipt', 'receipt'),
    billTools.query<ItemRow>('items', ALL),
    billTools.query<ClaimRow>('claims', ALL),
    billTools.query<GuestClaimRow>('guestClaims', ALL),
  ])
  if (!receipt.success || !items.success || !claims.success || !guestClaims.success) {
    return { success: false, error: 'Could not read the bill; try again' }
  }

  const lines: ShareLine[] = items.data.records.map((r) => ({
    id: r.recordId,
    kind: r.data.kind,
    priceCents: r.data.priceCents,
  }))
  const allClaims: ShareClaim[] = [
    ...claims.data.records.map((r) => ({ itemId: r.data.itemId, userId: r.data.userId, units: r.data.units ?? null })),
    ...guestClaims.data.records.map((r) => ({ itemId: r.data.itemId, userId: `guest:${r.data.guestId}`, units: r.data.units ?? null })),
  ]

  const claimedIds = new Set(allClaims.map((c) => c.itemId))
  const unclaimed = lines.filter((l) => (l.kind === 'item' || l.kind === 'discount') && !claimedIds.has(l.id))
  if (unclaimed.length > 0) {
    return { success: false, error: `${unclaimed.length} item${unclaimed.length === 1 ? ' is' : 's are'} still unclaimed` }
  }

  // "By how many" lines must have every unit assigned (3 of 3 tacos), or the split isn't final.
  for (const item of items.data.records) {
    const onLine = allClaims.filter((c) => c.itemId === item.recordId)
    if (onLine.length === 0 || !onLine.every((c) => typeof c.units === 'number' && c.units > 0)) continue
    const assigned = onLine.reduce((s, c) => s + (c.units ?? 0), 0)
    const qty = item.data.qty ?? 1
    if (assigned !== qty) {
      return { success: false, error: `${item.data.name ?? 'An item'}: ${assigned} of ${qty} assigned` }
    }
  }

  const r = receipt.data.record.data
  const check = reconcile(lines, {
    printedSubtotalCents: r.printedSubtotalCents ?? null,
    printedTotalCents: r.printedTotalCents,
    printedTipCents: r.printedTipCents ?? 0,
    chargedCents: r.chargedCents ?? null,
  })
  if (check.offByCents !== 0) {
    return { success: false, error: 'The lines don’t add up to the receipt yet. Fix them on the receipt screen first.' }
  }
  if (!check.reconciled) {
    return { success: false, error: 'The amount charged to the card doesn’t match the bill total. Check the tip.' }
  }

  const shares = computeShares(lines, allClaims, userId)
  const sharesTotal = shares.reduce((s, x) => s + x.totalCents, 0)
  if (sharesTotal !== check.grandTotalCents) {
    // computeShares guarantees this once everything is claimed; refuse rather than write a split that doesn't add up.
    console.error('[lockBill] shares do not sum to the bill', { billId, sharesTotal, total: check.grandTotalCents })
    return { success: false, error: 'Could not compute an exact split; nothing was locked' }
  }

  for (const share of shares) {
    // Keyed by person so a retry overwrites instead of duplicating (uniqueOn userId backs this up).
    const written = await billTools.create('shares', { ...share }, `share-${share.userId.replace(/[^A-Za-z0-9_-]/g, '_')}`)
    if (!written.success) return { success: false, error: 'Could not save the split; try again' }
  }

  const stamped = await billTools.update('receipt', 'receipt', { lockedAt: new Date().toISOString() })
  if (!stamped.success) return { success: false, error: 'Could not lock the bill; try again' }
  const indexed = await tools.update('bills', billId, { status: 'locked', totalCents: check.grandTotalCents })
  if (!indexed.success) console.error('[lockBill] bill locked but index not updated', billId)

  return { success: true, data: { totalCents: check.grandTotalCents, people: shares.length } }
}
