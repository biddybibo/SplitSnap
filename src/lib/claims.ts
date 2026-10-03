/**
 * Display helpers for the Claim screen: who claimed each line and each person's
 * "you $x" portion (even, or by units when everyone on the line has a count).
 * Everyone's totals come from computeShares.
 */

export interface ClaimableLine {
  id: string
  priceCents: number
  qty?: number
}

export interface ClaimRow {
  itemId: string
  userId: string
  units?: number | null
}

export interface LineClaims {
  claimantIds: string[]
  /** True when every claim on the line carries a count ("2 of 3"). */
  byUnits: boolean
  /** Units assigned so far, when byUnits. */
  unitsAssigned: number
  /** Each claimant's portion, rounded to the cent for display. */
  portions: Map<string, number>
}

export function claimsByLine(lines: ClaimableLine[], claims: ClaimRow[]): Map<string, LineClaims> {
  const byLine = new Map<string, LineClaims>()
  for (const line of lines) {
    const onLine: ClaimRow[] = []
    for (const c of claims) {
      if (c.itemId === line.id && !onLine.some((x) => x.userId === c.userId)) onLine.push(c)
    }
    const byUnits = onLine.length > 0 && onLine.every((c) => typeof c.units === 'number' && c.units > 0)
    const weight = (c: ClaimRow) => (byUnits ? (c.units as number) : 1)
    const total = onLine.reduce((s, c) => s + weight(c), 0)
    byLine.set(line.id, {
      claimantIds: onLine.map((c) => c.userId),
      byUnits,
      unitsAssigned: byUnits ? total : 0,
      portions: new Map(onLine.map((c) => [c.userId, Math.round((line.priceCents * weight(c)) / total)])),
    })
  }
  return byLine
}

export function unclaimedCount(lines: ClaimableLine[], byLine: Map<string, LineClaims>): number {
  return lines.filter((l) => (byLine.get(l.id)?.claimantIds.length ?? 0) === 0).length
}
