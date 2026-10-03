/**
 * computeShares — who owes what. One pure function for the claim-screen
 * preview, "Preview the final split", and the server's lockBill, so all three
 * always agree. All money is integer cents; the arithmetic is exact (BigInt
 * fractions), never floating point.
 *
 * Rules (CLAUDE.md):
 * 1. `item` and `discount` lines are claimed; each is split evenly among the
 *    people who claimed it. That's each person's subtotal.
 * 2. `fee`, `tax`, `tip` and `adjustment` lines are split in proportion to each
 *    person's subtotal (their share of the whole bill's food).
 * 3. Everyone except the host is rounded to the nearest cent, per category; the
 *    host takes whatever is left, so the shares add up to the bill exactly.
 *
 * While some lines are unclaimed (a live preview), their value isn't assigned
 * to anyone, and extras are still proportioned over the full food subtotal so
 * people's numbers don't jump as others claim. Once every claimable line has a
 * claimant — which lockBill requires — the shares sum to the bill total.
 *
 * If the food subtotal is zero or negative there is no fair proportion, so the
 * host carries the fees, tax, tip and adjustments.
 *
 * `hostAdjustment` lines ("share anyway, the host covers the difference") are
 * charged to the host alone, in their adjustmentCents.
 */

export type LineKind = 'item' | 'discount' | 'fee' | 'tax' | 'tip' | 'adjustment' | 'hostAdjustment'

export interface ShareLine {
  id: string
  kind: LineKind
  priceCents: number
}

export interface ShareClaim {
  itemId: string
  /** A user id, or `guest:<guestId>` for a host-added guest. */
  userId: string
}

export interface Share {
  userId: string
  subtotalCents: number
  feesCents: number
  taxCents: number
  tipCents: number
  adjustmentCents: number
  totalCents: number
}

type Category = 'subtotalCents' | 'feesCents' | 'taxCents' | 'tipCents' | 'adjustmentCents'

const EXTRA_CATEGORY: Record<Exclude<LineKind, 'item' | 'discount' | 'hostAdjustment'>, Category> = {
  fee: 'feesCents',
  tax: 'taxCents',
  tip: 'tipCents',
  adjustment: 'adjustmentCents',
}

const CATEGORIES: Category[] = ['subtotalCents', 'feesCents', 'taxCents', 'tipCents', 'adjustmentCents']

/** floor(a / b) for BigInt (BigInt division truncates toward zero). */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b
  return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q
}

/** a / b rounded to the nearest integer, halves rounded up. Requires b > 0. */
function roundDiv(a: bigint, b: bigint): bigint {
  return floorDiv(2n * a + b, 2n * b)
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b]
  return a < 0n ? -a : a
}

export function computeShares(lines: ShareLine[], claims: ShareClaim[], hostId: string): Share[] {
  for (const line of lines) {
    if (!Number.isSafeInteger(line.priceCents)) {
      throw new Error(`computeShares: line ${line.id} has a non-integer price (${line.priceCents})`)
    }
  }

  const claimable = lines.filter((l) => l.kind === 'item' || l.kind === 'discount')
  const claimableIds = new Set(claimable.map((l) => l.id))

  // Claimants per line, deduplicated, ignoring claims on lines that can't be claimed (or no longer exist).
  const claimantsByLine = new Map<string, string[]>()
  for (const c of claims) {
    if (!claimableIds.has(c.itemId)) continue
    const list = claimantsByLine.get(c.itemId) ?? []
    if (!list.includes(c.userId)) list.push(c.userId)
    claimantsByLine.set(c.itemId, list)
  }

  // Output order: host first, then everyone in the order they first claimed.
  const people: string[] = [hostId]
  for (const c of claims) {
    if (claimableIds.has(c.itemId) && !people.includes(c.userId)) people.push(c.userId)
  }

  // Exact subtotals as fractions over a common denominator D = lcm(claimant counts).
  let D = 1n
  for (const list of claimantsByLine.values()) {
    const n = BigInt(list.length)
    D = (D * n) / gcd(D, n)
  }
  const subNum = new Map<string, bigint>(people.map((p) => [p, 0n]))
  let claimedSubNum = 0n
  let totalSubNum = 0n
  for (const line of claimable) {
    const price = BigInt(line.priceCents)
    totalSubNum += price * D
    const claimants = claimantsByLine.get(line.id)
    if (!claimants) continue
    claimedSubNum += price * D
    const each = (price * D) / BigInt(claimants.length) // exact: D is a multiple of the count
    for (const p of claimants) subNum.set(p, subNum.get(p)! + each)
  }

  const shares = new Map<string, Share>(
    people.map((p) => [
      p,
      { userId: p, subtotalCents: 0, feesCents: 0, taxCents: 0, tipCents: 0, adjustmentCents: 0, totalCents: 0 },
    ]),
  )

  /** Non-hosts get their exact share rounded; the host gets `target` minus everyone else. */
  function allocate(category: Category, exactFor: (p: string) => [bigint, bigint], target: bigint) {
    let othersSum = 0n
    for (const p of people) {
      if (p === hostId) continue
      const [num, den] = exactFor(p)
      const cents = roundDiv(num, den)
      othersSum += cents
      shares.get(p)![category] = Number(cents)
    }
    shares.get(hostId)![category] = Number(target - othersSum)
  }

  // 1. Subtotals. Everything claimed is assigned exactly; only rounding moves to the host.
  allocate('subtotalCents', (p) => [subNum.get(p)!, D], claimedSubNum / D)

  // 2. Extras, one category at a time, in proportion to subtotal.
  const extraTotals = new Map<Category, bigint>()
  for (const line of lines) {
    if (line.kind === 'item' || line.kind === 'discount' || line.kind === 'hostAdjustment') continue
    const cat = EXTRA_CATEGORY[line.kind]
    extraTotals.set(cat, (extraTotals.get(cat) ?? 0n) + BigInt(line.priceCents))
  }
  for (const [cat, total] of extraTotals) {
    if (totalSubNum <= 0n) {
      // No food subtotal to proportion by: the host carries it.
      allocate(cat, () => [0n, 1n], total)
      continue
    }
    // The part of this extra that belongs to claimed food (all of it once everything is claimed).
    const target = roundDiv(total * claimedSubNum, totalSubNum)
    allocate(cat, (p) => [total * subNum.get(p)!, totalSubNum], target)
  }

  // 3. The host's own "I'll cover the difference" lines: theirs alone.
  for (const line of lines) {
    if (line.kind === 'hostAdjustment') shares.get(hostId)!.adjustmentCents += line.priceCents
  }

  for (const s of shares.values()) {
    s.totalCents = CATEGORIES.reduce((sum, c) => sum + s[c], 0)
  }
  return [...shares.values()]
}
