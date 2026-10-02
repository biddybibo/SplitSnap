/**
 * Display math for the Claim screen: who claimed each line and each person's
 * even portion of it. Display-only — the authoritative amounts (tax, fees, tip,
 * leftover pennies) come from computeShares when the host locks the bill.
 */

export interface ClaimableLine {
  id: string
  priceCents: number
}

export interface ClaimRow {
  itemId: string
  userId: string
}

export interface LineClaims {
  claimantIds: string[]
  /** price ÷ claimants, rounded to the cent for display. */
  portionCents: number | null
}

export function claimsByLine(lines: ClaimableLine[], claims: ClaimRow[]): Map<string, LineClaims> {
  const byLine = new Map<string, LineClaims>()
  for (const line of lines) {
    const claimantIds = claims.filter((c) => c.itemId === line.id).map((c) => c.userId)
    byLine.set(line.id, {
      claimantIds,
      portionCents: claimantIds.length === 0 ? null : Math.round(line.priceCents / claimantIds.length),
    })
  }
  return byLine
}

/** One person's running total of item portions (before tax, fees and tip). */
export function itemsTotalFor(userId: string, lines: ClaimableLine[], byLine: Map<string, LineClaims>): number {
  return lines.reduce((sum, line) => {
    const c = byLine.get(line.id)
    return c && c.claimantIds.includes(userId) && c.portionCents !== null ? sum + c.portionCents : sum
  }, 0)
}

export function unclaimedCount(lines: ClaimableLine[], byLine: Map<string, LineClaims>): number {
  return lines.filter((l) => (byLine.get(l.id)?.claimantIds.length ?? 0) === 0).length
}
