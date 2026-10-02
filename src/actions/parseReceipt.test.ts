import { describe, expect, it } from 'vitest'
import { checkReceipt } from './parseReceipt'

const item = (priceCents: number, qty = 1) => ({ name: 'x', qty, priceCents })

describe('checkReceipt', () => {
  it('passes a receipt that adds up (The Tack Room)', () => {
    const r = {
      merchant: 'The Tack Room',
      items: [700, 300, 1000, 3400, 2500, 1700, 1800].map((c) => item(c)),
      subtotalCents: 11400,
      fees: [],
      taxCents: 1053,
      tipCents: 0,
      totalCents: 12453,
    }
    expect(checkReceipt(r)).toEqual({
      linesCents: 11400,
      linesMatchSubtotal: true,
      subtotalPlusChargesMatchesTotal: true,
      offByCents: 0,
    })
  })

  it('treats a service charge as a fee between subtotal and total (Westin / Lona)', () => {
    const r = {
      merchant: 'The Westin Fort Lauderdale Beach Resort - Lona',
      items: [item(1600), item(1800)],
      subtotalCents: 3400,
      fees: [{ name: '18% House Service Charge', cents: 612 }],
      taxCents: 238,
      tipCents: 0,
      totalCents: 4250,
    }
    expect(checkReceipt(r)).toEqual({
      linesCents: 3400,
      linesMatchSubtotal: true,
      subtotalPlusChargesMatchesTotal: true,
      offByCents: 0,
    })
  })

  it('points at the lines when lines disagree with a consistent subtotal + total (DINEFINE)', () => {
    const r = {
      merchant: 'DINEFINE',
      items: [item(2400, 2), item(2200), item(750), item(600, 2)],
      subtotalCents: 4750,
      fees: [],
      taxCents: 380,
      tipCents: 0,
      totalCents: 5130,
    }
    const check = checkReceipt(r)
    expect(check.linesMatchSubtotal).toBe(false)
    expect(check.subtotalPlusChargesMatchesTotal).toBe(true)
    expect(check.offByCents).toBe(-1200)
  })

  it('points at the total when lines match the subtotal but the total is off', () => {
    const r = { merchant: 'm', items: [item(1000)], subtotalCents: 1000, fees: [], taxCents: 80, tipCents: 0, totalCents: 1800 }
    const check = checkReceipt(r)
    expect(check.linesMatchSubtotal).toBe(true)
    expect(check.subtotalPlusChargesMatchesTotal).toBe(false)
    expect(check.offByCents).toBe(720)
  })

  it('reports no subtotal comparison when none is printed', () => {
    const r = { merchant: 'm', items: [item(1000), item(-200)], subtotalCents: null, fees: [], taxCents: 64, tipCents: 150, totalCents: 1014 }
    expect(checkReceipt(r)).toEqual({
      linesCents: 800,
      linesMatchSubtotal: null,
      subtotalPlusChargesMatchesTotal: true,
      offByCents: 0,
    })
  })
})
