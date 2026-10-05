import { describe, expect, it } from 'vitest'
import { amountOwed, cryptoRandomBelow, pickLoser } from './roulette'

const shares: Record<string, number> = { host: 1635, felix: 654, gina: 763, dev: 500 }
const shareOf = (id: string) => shares[id] ?? 0

describe('pickLoser', () => {
  const entrants = [{ id: 'host', weight: 1635 }, { id: 'felix', weight: 654 }, { id: 'dev', weight: 500 }]

  it('even mode: each entrant owns one slot', () => {
    expect(pickLoser(entrants, 'even', () => 0)).toBe('host')
    expect(pickLoser(entrants, 'even', () => 1)).toBe('felix')
    expect(pickLoser(entrants, 'even', () => 2)).toBe('dev')
  })

  it('weighted mode: slots proportional to what each ordered', () => {
    expect(pickLoser(entrants, 'weighted', () => 1634)).toBe('host')
    expect(pickLoser(entrants, 'weighted', () => 1635)).toBe('felix')
    expect(pickLoser(entrants, 'weighted', () => 1635 + 654)).toBe('dev')
  })

  it('needs at least two people', () => {
    expect(() => pickLoser([{ id: 'a', weight: 1 }], 'even', () => 0)).toThrow()
  })

  it('crypto draw stays in range and covers every value', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const v = cryptoRandomBelow(3)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(3)
      seen.add(v)
    }
    expect(seen.size).toBe(3)
  })
})

describe('amountOwed', () => {
  const result = { loserId: 'felix', mode: 'even' as const, entrantIds: ['host', 'felix', 'dev'] }

  it('the losing friend covers everyone who was in, the host included', () => {
    expect(amountOwed('felix', 'host', shareOf, result)).toBe(1635 + 654 + 500)
  })
  it('other entrants owe nothing; non-entrants pay their own share', () => {
    expect(amountOwed('dev', 'host', shareOf, result)).toBe(0)
    expect(amountOwed('gina', 'host', shareOf, result)).toBe(763)
  })
  it('if the host loses, friends who were in owe nothing', () => {
    const hostLoses = { ...result, loserId: 'host' }
    expect(amountOwed('felix', 'host', shareOf, hostLoses)).toBe(0)
    expect(amountOwed('dev', 'host', shareOf, hostLoses)).toBe(0)
  })
  it('without a result, everyone owes their own share', () => {
    expect(amountOwed('felix', 'host', shareOf, null)).toBe(654)
    expect(amountOwed('host', 'host', shareOf, null)).toBe(0)
  })
})
