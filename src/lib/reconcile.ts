/**
 * Reconcile math, shared by the review screen and (Sunday) lockBill so both
 * apply the same rule. Pure; all money is integer cents.
 *
 * A tip printed on the receipt is inside printedTotalCents; a tip the host
 * adds is on top of it. So the check runs on every non-tip line, and tip
 * lines hold whatever tip is actually being paid.
 */

export type LineKind = 'item' | 'discount' | 'fee' | 'tax' | 'tip' | 'adjustment' | 'hostAdjustment'

export interface Line {
  kind: LineKind
  priceCents: number
}

export interface PrintedNumbers {
  printedSubtotalCents: number | null
  printedTotalCents: number
  printedTipCents: number
  chargedCents: number | null
}

const sum = (lines: Line[], kinds: LineKind[]) =>
  lines.filter((l) => kinds.includes(l.kind)).reduce((s, l) => s + l.priceCents, 0)

export function reconcile(lines: Line[], printed: PrintedNumbers) {
  const claimableCents = sum(lines, ['item', 'discount'])
  const feesCents = sum(lines, ['fee'])
  const taxCents = sum(lines, ['tax'])
  // Both kinds close the gap to the receipt; they differ only in who pays (computeShares).
  const adjustmentCents = sum(lines, ['adjustment', 'hostAdjustment'])
  const tipCents = sum(lines, ['tip'])

  const preTipCents = claimableCents + feesCents + taxCents + adjustmentCents
  const printedPreTipCents = printed.printedTotalCents - printed.printedTipCents
  const grandTotalCents = preTipCents + tipCents

  const linesMatchSubtotal =
    printed.printedSubtotalCents === null ? null : claimableCents === printed.printedSubtotalCents
  const chargesMatchTotal =
    (printed.printedSubtotalCents ?? claimableCents) + feesCents + taxCents + printed.printedTipCents ===
    printed.printedTotalCents

  // Positive: the lines are short of the receipt; negative: they exceed it.
  const offByCents = printedPreTipCents - preTipCents
  // Which number to point the host at. Lines disagreeing with the printed subtotal is the most
  // specific signal; otherwise, printed numbers that don't add up mean the total or tax was misread.
  let suspect: 'lines' | 'total' | null = null
  if (offByCents !== 0) suspect = linesMatchSubtotal === false || chargesMatchTotal ? 'lines' : 'total'

  return {
    claimableCents,
    feesCents,
    taxCents,
    adjustmentCents,
    tipCents,
    preTipCents,
    grandTotalCents,
    linesMatchSubtotal,
    chargesMatchTotal,
    offByCents,
    suspect,
    /** Tip implied by the card charge, or null when no charge is entered. */
    tipFromChargedCents: printed.chargedCents === null ? null : printed.chargedCents - printedPreTipCents,
    chargedMismatchCents: printed.chargedCents === null ? null : printed.chargedCents - grandTotalCents,
    /** What lockBill will require. */
    reconciled: offByCents === 0 && (printed.chargedCents === null || printed.chargedCents === grandTotalCents),
  }
}

/** Tip as a percentage of the pre-tax food subtotal, rounded to the cent. */
export function tipForPercent(claimableCents: number, percent: number): number {
  return Math.round((claimableCents * percent) / 100)
}
