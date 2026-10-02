/**
 * Display helpers for the Claim screen: who claimed each line and the per-item
 * "you $x" portion. Everyone's totals come from computeShares.
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

export function unclaimedCount(lines: ClaimableLine[], byLine: Map<string, LineClaims>): number {
  return lines.filter((l) => (byLine.get(l.id)?.claimantIds.length ?? 0) === 0).length
}
