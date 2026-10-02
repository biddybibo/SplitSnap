import { describe, expect, it } from 'vitest'
import { checkReceipt } from './parseReceipt'

const item = (priceCents: number, qty = 1) => ({ name: 'x', qty, priceCents })

describe('checkReceipt', () => {
  it('passes a receipt that adds up (The Tack Room)', () => {
    const r = {
      merchant: 'The Tack Room',
      items: [700, 300, 1000, 3400, 2500, 1700, 1800].map((c) => item(c)),
      subtotalCents: 11400,
      taxCents: 1053,
      tipCents: 0,
      totalCents: 12453,
    }
    expect(checkReceipt(r)).toEqual({
      linesCents: 11400,
      linesMatchSubtotal: true,
      subtotalPlusTaxTipMatchesTotal: true,
      offByCents: 0,
    })
  })

  it('points at the lines when lines disagree with a consistent subtotal + total (DINEFINE)', () => {
    const r = {
      merchant: 'DINEFINE',
      items: [item(2400, 2), item(2200), item(750), item(600, 2)],
      subtotalCents: 4750,
      taxCents: 380,
      tipCents: 0,
      totalCents: 5130,
    }
    const check = checkReceipt(r)
    expect(check.linesMatchSubtotal).toBe(false)
    expect(check.subtotalPlusTaxTipMatchesTotal).toBe(true)
    expect(check.offByCents).toBe(-1200)
  })

  it('points at the total when lines match the subtotal but the total is off', () => {
    const r = { merchant: 'm', items: [item(1000)], subtotalCents: 1000, taxCents: 80, tipCents: 0, totalCents: 1800 }
    const check = checkReceipt(r)
    expect(check.linesMatchSubtotal).toBe(true)
    expect(check.subtotalPlusTaxTipMatchesTotal).toBe(false)
    expect(check.offByCents).toBe(720)
  })

  it('reports no subtotal comparison when none is printed', () => {
    const r = { merchant: 'm', items: [item(1000), item(-200)], subtotalCents: null, taxCents: 64, tipCents: 150, totalCents: 1014 }
    expect(checkReceipt(r)).toEqual({
      linesCents: 800,
      linesMatchSubtotal: null,
      subtotalPlusTaxTipMatchesTotal: true,
      offByCents: 0,
    })
  })
})
