import { describe, expect, it } from 'vitest'
import { billMath, type BillItem } from './billMath'

const item = (id: string, priceCents: number, kind: BillItem['data']['kind'] = 'item', qty = 1): BillItem => ({
  recordId: id,
  data: { name: id, priceCents, kind, qty },
})

describe('billMath', () => {
  const items = [item('tacos', 1450, 'item', 3), item('fries', 600), item('tax', 205, 'tax')]
  const receipt = { printedSubtotalCents: 2050, printedTotalCents: 2255, hostId: 'host' }

  it('wires reconcile, claim display and computeShares from the same rows', () => {
    const m = billMath(items, receipt, [
      { itemId: 'tacos', userId: 'a', units: 2 },
      { itemId: 'tacos', userId: 'host', units: 1 },
      { itemId: 'fries', userId: 'a' },
    ])
    expect(m.check.offByCents).toBe(0)
    expect(m.claimable.map((l) => [l.id, l.qty])).toEqual([['tacos', 3], ['fries', 1]])
    expect(m.byLine.get('tacos')?.unitsAssigned).toBe(3)
    expect(m.shares.reduce((s, x) => s + x.totalCents, 0)).toBe(2255)
  })

  it('treats a missing or zero qty as 1', () => {
    const m = billMath([item('x', 100, 'item', 0)], { printedTotalCents: 100, hostId: 'h' }, [])
    expect(m.claimable[0].qty).toBe(1)
  })
})
