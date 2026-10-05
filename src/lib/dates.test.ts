import { describe, expect, it } from 'vitest'
import { parsePrintedAt, receiptStamp, shortDay } from './dates'

describe('receipt dates', () => {
  it('pins a date-only receipt to local midnight, not UTC', () => {
    expect(parsePrintedAt('2024-10-04')?.getDate()).toBe(4)
  })
  it('rejects junk', () => {
    expect(parsePrintedAt('not a date')).toBeNull()
    expect(parsePrintedAt('')).toBeNull()
    expect(receiptStamp(undefined)).toBe('')
  })
  it('says Today for today, else a short date', () => {
    const now = new Date(2026, 9, 4, 12)
    expect(shortDay(new Date(2026, 9, 4, 8), now)).toBe('Today')
    expect(shortDay(new Date(2026, 9, 1, 8), now)).toBe('Oct 1')
  })
  it('includes the time only when the receipt printed one', () => {
    expect(receiptStamp('2024-10-04')).toBe('Oct 4, 2024')
    expect(receiptStamp('2024-10-04T13:05')).toBe('Oct 4, 2024, 1:05 PM')
  })
})
