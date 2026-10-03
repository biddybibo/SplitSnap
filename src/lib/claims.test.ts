import { describe, expect, it } from 'vitest'
import { claimsByLine, unclaimedCount } from './claims'

const lines = [
  { id: 'pastor', priceCents: 1325 },
  { id: 'churros', priceCents: 700 },
  { id: 'jarritos', priceCents: 350 },
  { id: 'tacos', priceCents: 1450, qty: 3 },
]
const claims = [
  { itemId: 'pastor', userId: 'roy' },
  { itemId: 'pastor', userId: 'maya' },
  { itemId: 'churros', userId: 'roy' },
  { itemId: 'churros', userId: 'maya' },
  { itemId: 'churros', userId: 'dev' },
  { itemId: 'tacos', userId: 'roy', units: 2 },
  { itemId: 'tacos', userId: 'dev', units: 1 },
]

describe('claim display math', () => {
  const byLine = claimsByLine(lines, claims)

  it('splits evenly, rounded for display', () => {
    expect(byLine.get('pastor')?.portions.get('roy')).toBe(663)
    expect(byLine.get('churros')?.portions.get('dev')).toBe(233)
    expect(byLine.get('jarritos')?.claimantIds).toEqual([])
  })

  it('splits by units when everyone on the line has a count', () => {
    const t = byLine.get('tacos')!
    expect(t.byUnits).toBe(true)
    expect(t.unitsAssigned).toBe(3)
    expect(t.portions.get('roy')).toBe(967)
    expect(t.portions.get('dev')).toBe(483)
  })

  it('counts unclaimed lines', () => {
    expect(unclaimedCount(lines, byLine)).toBe(1)
  })
})
