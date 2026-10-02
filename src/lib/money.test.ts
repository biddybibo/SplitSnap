import { describe, expect, it } from 'vitest'
import { formatCents, parseDollars } from './money'

describe('parseDollars', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['$12.50', 1250],
    ['1,299.00', 129900],
    ['-2', -200],
    ['.75', 75],
    [' 3.10 ', 310],
  ])('%s → %i', (input, cents) => expect(parseDollars(input)).toBe(cents))

  it.each(['', 'abc', '12.345', '1.2.3', '$', '--1'])('rejects %j', (input) => expect(parseDollars(input)).toBeNull())
})

describe('formatCents', () => {
  it('formats cents as dollars', () => {
    expect(formatCents(1299)).toBe('$12.99')
    expect(formatCents(-200)).toBe('-$2.00')
  })
})
