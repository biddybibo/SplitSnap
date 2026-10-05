/**
 * Is a freshly scanned receipt one the host already scanned? Strongest evidence first:
 *   1. same restaurant + check number + date             → 'exact'
 *   2. same restaurant + printed date-time + total        → 'exact'
 *   3. same restaurant + total + the same line prices,
 *      scanned within 7 days                              → 'likely'
 * Pure: the caller supplies the candidates (and their line prices for rule 3).
 */

export interface ScannedReceipt {
  merchant: string
  receiptNumber: string
  printedAt: string
  totalCents: number
  linePrices: number[]
}

export interface Candidate extends Omit<ScannedReceipt, 'linePrices'> {
  billId: string
  createdAt: string
  /** Only needed for rule 3; fetched lazily for candidates that pass the cheap checks. */
  linePrices?: number[]
}

export type DuplicateStrength = 'exact' | 'likely'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** "Lona" and "The Westin Fort Lauderdale Beach Resort - Lona" are the same place; empty never matches. */
export function sameMerchant(a: string, b: string): boolean {
  const x = normalize(a)
  const y = normalize(b)
  if (x.length < 3 || y.length < 3) return false
  return x === y || x.includes(y) || y.includes(x)
}

/** The check number as digits/letters only: "CHK 37554", "Chk #37554" and "37554" all compare equal. */
export function normalizeCheckNumber(s: string): string {
  return normalize(s).replace(/^(check|chk|order|ord|ticket|tkt|no|number)+/, '')
}

const dayOf = (printedAt: string) => printedAt.slice(0, 10)
const sortedEqual = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort((p, q) => p - q).every((v, i) => v === [...b].sort((p, q) => p - q)[i])

/** Rules 1–2 need only the bills index; returns the match, or the candidates worth checking line prices for. */
export function cheapMatch(
  scan: ScannedReceipt,
  candidates: Candidate[],
  now = Date.now(),
): { match: { billId: string; strength: DuplicateStrength } | null; needLines: Candidate[] } {
  const sameShop = candidates.filter((c) => sameMerchant(c.merchant, scan.merchant))
  const num = normalizeCheckNumber(scan.receiptNumber)
  for (const c of sameShop) {
    if (num && normalizeCheckNumber(c.receiptNumber) === num && scan.printedAt && dayOf(c.printedAt) === dayOf(scan.printedAt)) {
      return { match: { billId: c.billId, strength: 'exact' }, needLines: [] }
    }
  }
  for (const c of sameShop) {
    if (scan.printedAt.length > 10 && c.printedAt === scan.printedAt && c.totalCents === scan.totalCents) {
      return { match: { billId: c.billId, strength: 'exact' }, needLines: [] }
    }
  }
  const recent = sameShop.filter(
    (c) => c.totalCents === scan.totalCents && now - new Date(c.createdAt).getTime() <= WEEK_MS,
  )
  return { match: null, needLines: recent }
}

/** Rule 3, once the caller has fetched line prices for `needLines`. */
export function lineMatch(scan: ScannedReceipt, withLines: Candidate[]): { billId: string; strength: DuplicateStrength } | null {
  const hit = withLines.find((c) => c.linePrices && sortedEqual(c.linePrices, scan.linePrices))
  return hit ? { billId: hit.billId, strength: 'likely' } : null
}
