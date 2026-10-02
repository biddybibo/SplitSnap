import { describe, expect, it } from 'vitest'
import { reconcile, tipForPercent, type Line } from './reconcile'

const westin: Line[] = [
  { kind: 'item', priceCents: 1600 },
  { kind: 'item', priceCents: 1800 },
  { kind: 'fee', priceCents: 612 },
  { kind: 'tax', priceCents: 238 },
]
const westinPrinted = { printedSubtotalCents: 3400, printedTotalCents: 4250, printedTipCents: 0, chargedCents: null }

describe('reconcile', () => {
  it('reconciles a receipt that adds up, before any tip', () => {
    const r = reconcile(westin, westinPrinted)
    expect(r).toMatchObject({ offByCents: 0, suspect: null, grandTotalCents: 4250, reconciled: true })
  })

  it('puts an added tip on top of the printed total', () => {
    const r = reconcile([...westin, { kind: 'tip', priceCents: 680 }], westinPrinted)
    expect(r).toMatchObject({ offByCents: 0, tipCents: 680, grandTotalCents: 4930, reconciled: true })
  })

  it('does not double-count a tip printed inside the total', () => {
    const lines: Line[] = [{ kind: 'item', priceCents: 1000 }, { kind: 'tax', priceCents: 80 }, { kind: 'tip', priceCents: 200 }]
    const r = reconcile(lines, { printedSubtotalCents: 1000, printedTotalCents: 1280, printedTipCents: 200, chargedCents: null })
    expect(r).toMatchObject({ offByCents: 0, grandTotalCents: 1280, reconciled: true })
  })

  it('points at the lines when a line is misread, and an adjustment clears it', () => {
    const lines: Line[] = [{ kind: 'item', priceCents: 2400 }, { kind: 'item', priceCents: 2350 }, { kind: 'tax', priceCents: 380 }]
    const printed = { printedSubtotalCents: 3550, printedTotalCents: 3930, printedTipCents: 0, chargedCents: null }
    expect(reconcile(lines, printed)).toMatchObject({ offByCents: -1200, suspect: 'lines', reconciled: false })
    const fixed = reconcile([...lines, { kind: 'adjustment', priceCents: -1200 }], printed)
    expect(fixed).toMatchObject({ offByCents: 0, suspect: null, reconciled: true })
  })

  it('points at the total when the lines match the subtotal but the total was misread', () => {
    const lines: Line[] = [{ kind: 'item', priceCents: 1000 }, { kind: 'tax', priceCents: 80 }]
    const r = reconcile(lines, { printedSubtotalCents: 1000, printedTotalCents: 1800, printedTipCents: 0, chargedCents: null })
    expect(r).toMatchObject({ offByCents: 720, suspect: 'total' })
  })

  it('derives the tip from the amount charged and checks the charge', () => {
    const r = reconcile(westin, { ...westinPrinted, chargedCents: 5100 })
    expect(r.tipFromChargedCents).toBe(850)
    expect(r.chargedMismatchCents).toBe(850)
    expect(r.reconciled).toBe(false)
    const withTip = reconcile([...westin, { kind: 'tip', priceCents: 850 }], { ...westinPrinted, chargedCents: 5100 })
    expect(withTip).toMatchObject({ chargedMismatchCents: 0, reconciled: true })
  })
})

describe('tipForPercent', () => {
  it('uses the pre-tax food subtotal and rounds to the cent', () => {
    expect(tipForPercent(3400, 20)).toBe(680)
    expect(tipForPercent(3333, 18)).toBe(600)
  })
})
