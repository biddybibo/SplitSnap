import { describe, expect, it } from 'vitest'
import { claimsByLine, itemsTotalFor, unclaimedCount } from './claims'

const lines = [
  { id: 'pastor', priceCents: 1325 },
  { id: 'elote', priceCents: 600 },
  { id: 'churros', priceCents: 700 },
  { id: 'jarritos', priceCents: 350 },
]
const claims = [
  { itemId: 'pastor', userId: 'roy' },
  { itemId: 'pastor', userId: 'maya' },
  { itemId: 'elote', userId: 'roy' },
  { itemId: 'churros', userId: 'roy' },
  { itemId: 'churros', userId: 'maya' },
  { itemId: 'churros', userId: 'dev' },
]

describe('claim display math', () => {
  const byLine = claimsByLine(lines, claims)

  it('lists claimants per line and splits evenly, rounded for display', () => {
    expect(byLine.get('pastor')).toEqual({ claimantIds: ['roy', 'maya'], portionCents: 663 })
    expect(byLine.get('churros')?.portionCents).toBe(233)
    expect(byLine.get('jarritos')).toEqual({ claimantIds: [], portionCents: null })
  })

  it("totals one person's portions", () => {
    expect(itemsTotalFor('roy', lines, byLine)).toBe(663 + 600 + 233)
    expect(itemsTotalFor('dev', lines, byLine)).toBe(233)
    expect(itemsTotalFor('nobody', lines, byLine)).toBe(0)
  })

  it('counts unclaimed lines', () => {
    expect(unclaimedCount(lines, byLine)).toBe(1)
  })
})
