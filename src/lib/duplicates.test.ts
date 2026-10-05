import { describe, expect, it } from 'vitest'
import { cheapMatch, lineMatch, normalizeCheckNumber, sameMerchant, type Candidate } from './duplicates'

const now = new Date('2026-10-04T20:00:00Z').getTime()
const scan = {
  merchant: 'The Westin Fort Lauderdale Beach Resort - Lona',
  receiptNumber: 'CHK 37554',
  printedAt: '2024-10-04T13:05',
  totalCents: 4250,
  linePrices: [1600, 1800],
}
const cand = (over: Partial<Candidate>): Candidate => ({
  billId: 'old',
  merchant: 'Lona',
  receiptNumber: '',
  printedAt: '',
  totalCents: 4250,
  createdAt: '2026-10-03T20:00:00Z',
  ...over,
})

describe('duplicate receipts', () => {
  it('treats the same restaurant loosely, but never matches on an empty name', () => {
    expect(sameMerchant('Lona', 'The Westin Fort Lauderdale Beach Resort - Lona')).toBe(true)
    expect(sameMerchant('', 'Lona')).toBe(false)
    expect(sameMerchant('Taqueria Luna', 'Lona')).toBe(false)
  })

  it('normalizes check numbers', () => {
    expect(normalizeCheckNumber('CHK 37554')).toBe('37554')
    expect(normalizeCheckNumber('Chk #37554')).toBe('37554')
    expect(normalizeCheckNumber('Order 12')).toBe('12')
  })

  it('rule 1: same check number and day is exact', () => {
    const r = cheapMatch(scan, [cand({ receiptNumber: 'Chk #37554', printedAt: '2024-10-04T13:06' })], now)
    expect(r.match).toEqual({ billId: 'old', strength: 'exact' })
  })

  it('a reused check number on another day is not a match', () => {
    const r = cheapMatch(scan, [cand({ receiptNumber: '37554', printedAt: '2024-11-20T19:00', totalCents: 999 })], now)
    expect(r.match).toBeNull()
  })

  it('rule 2: same printed date-time and total is exact', () => {
    expect(cheapMatch(scan, [cand({ printedAt: '2024-10-04T13:05' })], now).match?.strength).toBe('exact')
  })

  it('rule 3: same total within a week needs the same line prices', () => {
    const r = cheapMatch({ ...scan, receiptNumber: '', printedAt: '' }, [cand({})], now)
    expect(r.match).toBeNull()
    expect(r.needLines.map((c) => c.billId)).toEqual(['old'])
    expect(lineMatch(scan, [{ ...r.needLines[0], linePrices: [1800, 1600] }])).toEqual({ billId: 'old', strength: 'likely' })
    expect(lineMatch(scan, [{ ...r.needLines[0], linePrices: [1800, 1500] }])).toBeNull()
  })

  it('rule 3 ignores bills older than a week', () => {
    const r = cheapMatch({ ...scan, receiptNumber: '', printedAt: '' }, [cand({ createdAt: '2026-09-20T20:00:00Z' })], now)
    expect(r.needLines).toEqual([])
  })
})
