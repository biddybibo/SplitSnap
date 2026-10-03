import { describe, expect, it } from 'vitest'
import { computeShares, type ShareClaim, type ShareLine } from './computeShares'

const line = (id: string, priceCents: number, kind: ShareLine['kind'] = 'item'): ShareLine => ({ id, kind, priceCents })
const claim = (itemId: string, userId: string): ShareClaim => ({ itemId, userId })
const byUser = (shares: ReturnType<typeof computeShares>) => Object.fromEntries(shares.map((s) => [s.userId, s]))
const sum = (shares: ReturnType<typeof computeShares>) => shares.reduce((s, x) => s + x.totalCents, 0)

describe('computeShares', () => {
  it("matches the plan's sample bill: Taqueria Luna, $74.97 → Roy $33.39, Maya $26.28, Dev $15.30", () => {
    const lines = [
      line('carne', 1450),
      line('pastor', 1325),
      line('elote', 600),
      line('chips', 950),
      line('horchata', 425),
      line('jarritos', 350),
      line('churros', 700),
      line('tax', 537, 'tax'),
      line('tip', 1160, 'tip'),
    ]
    const claims = [
      claim('carne', 'roy'),
      claim('horchata', 'roy'),
      claim('chips', 'roy'),
      claim('churros', 'roy'),
      claim('pastor', 'maya'),
      claim('chips', 'maya'),
      claim('churros', 'maya'),
      claim('elote', 'dev'),
      claim('jarritos', 'dev'),
      claim('churros', 'dev'),
    ]
    const shares = computeShares(lines, claims, 'maya')
    const s = byUser(shares)
    expect(s.roy).toMatchObject({ subtotalCents: 2583, taxCents: 239, tipCents: 517, totalCents: 3339 })
    expect(s.maya.totalCents).toBe(2628)
    expect(s.dev.totalCents).toBe(1530)
    expect(sum(shares)).toBe(7497)
  })

  it('splits the Westin bill: a fee, tax and an added tip in proportion to subtotal', () => {
    const lines = [
      line('picante', 1600),
      line('tacos', 1800),
      line('service', 612, 'fee'),
      line('tax', 238, 'tax'),
      line('tip', 680, 'tip'),
    ]
    const claims = [claim('picante', 'roy'), claim('tacos', 'roy'), claim('tacos', 'maya')]
    const s = byUser(computeShares(lines, claims, 'maya'))
    expect(s.roy).toEqual({
      userId: 'roy',
      subtotalCents: 2500,
      feesCents: 450,
      taxCents: 175,
      tipCents: 500,
      adjustmentCents: 0,
      totalCents: 3625,
    })
    expect(s.maya.totalCents).toBe(1305)
    expect(s.roy.totalCents + s.maya.totalCents).toBe(4930)
  })

  it('gives the leftover cent of an uneven split to the host', () => {
    const shares = computeShares([line('churros', 700)], [claim('churros', 'a'), claim('churros', 'b'), claim('churros', 'host')], 'host')
    const s = byUser(shares)
    expect(s.a.subtotalCents).toBe(233)
    expect(s.b.subtotalCents).toBe(233)
    expect(s.host.subtotalCents).toBe(234)
    expect(sum(shares)).toBe(700)
  })

  it('gives rounding pennies to the host even when the host claimed nothing', () => {
    const shares = computeShares([line('x', 100)], [claim('x', 'a'), claim('x', 'b'), claim('x', 'c')], 'host')
    const s = byUser(shares)
    expect([s.a.totalCents, s.b.totalCents, s.c.totalCents]).toEqual([33, 33, 33])
    expect(s.host.totalCents).toBe(1)
    expect(sum(shares)).toBe(100)
  })

  it('handles zero tip and no extras at all', () => {
    const shares = computeShares([line('a', 1000), line('b', 500)], [claim('a', 'host'), claim('b', 'x')], 'host')
    expect(byUser(shares)).toMatchObject({ host: { totalCents: 1000, tipCents: 0 }, x: { totalCents: 500, tipCents: 0 } })
  })

  it('applies a claimed discount to whoever claimed it, and shrinks their share of extras', () => {
    const lines = [line('burger', 2000), line('salad', 1000), line('coupon', -500, 'discount'), line('tax', 250, 'tax')]
    const claims = [claim('burger', 'a'), claim('coupon', 'a'), claim('salad', 'host')]
    const s = byUser(computeShares(lines, claims, 'host'))
    expect(s.a.subtotalCents).toBe(1500)
    expect(s.a.taxCents).toBe(150) // 250 × 1500 / 2500
    expect(s.host.taxCents).toBe(100)
    expect(s.a.totalCents + s.host.totalCents).toBe(2750)
  })

  it('splits a negative adjustment by subtotal too', () => {
    const lines = [line('a', 3000), line('b', 1000), line('adj', -1200, 'adjustment')]
    const s = byUser(computeShares(lines, [claim('a', 'x'), claim('b', 'host')], 'host'))
    expect(s.x.adjustmentCents).toBe(-900)
    expect(s.host.adjustmentCents).toBe(-300)
  })

  it('charges a host adjustment ("host covers the difference") to the host alone', () => {
    const lines = [line('a', 3000), line('b', 1000), line('gap', 210, 'hostAdjustment'), line('tax', 400, 'tax')]
    const shares = computeShares(lines, [claim('a', 'x'), claim('b', 'host')], 'host')
    const s = byUser(shares)
    expect(s.x).toMatchObject({ subtotalCents: 3000, taxCents: 300, adjustmentCents: 0, totalCents: 3300 })
    expect(s.host).toMatchObject({ subtotalCents: 1000, taxCents: 100, adjustmentCents: 210, totalCents: 1310 })
    expect(sum(shares)).toBe(4610)
  })

  it('treats guest claimants like anyone else', () => {
    const shares = computeShares(
      [line('a', 1000), line('tip', 200, 'tip')],
      [claim('a', 'guest:g1'), claim('a', 'host')],
      'host',
    )
    expect(byUser(shares)['guest:g1']).toMatchObject({ subtotalCents: 500, tipCents: 100, totalCents: 600 })
  })

  it('ignores duplicate claims and claims on non-claimable or deleted lines', () => {
    const lines = [line('a', 1000), line('tax', 100, 'tax')]
    const claims = [claim('a', 'x'), claim('a', 'x'), claim('tax', 'y'), claim('gone', 'z')]
    const shares = computeShares(lines, claims, 'host')
    expect(shares.map((s) => s.userId)).toEqual(['host', 'x'])
    expect(byUser(shares).x.totalCents).toBe(1100)
  })

  it('previews without assigning unclaimed lines, and extras stay proportioned over the whole subtotal', () => {
    const lines = [line('a', 1000), line('b', 1000), line('tax', 200, 'tax')]
    const s = byUser(computeShares(lines, [claim('a', 'x')], 'host'))
    expect(s.x).toMatchObject({ subtotalCents: 1000, taxCents: 100, totalCents: 1100 })
    expect(s.host.totalCents).toBe(0) // the unclaimed $10 + its $1 of tax aren't pinned on the host
  })

  it('puts the extras on the host when nothing is claimed', () => {
    const s = byUser(computeShares([line('a', 1000), line('tip', 300, 'tip')], [], 'host'))
    expect(s.host).toMatchObject({ subtotalCents: 0, tipCents: 0, totalCents: 0 })
  })

  it('puts the extras on the host when the food subtotal is zero or negative', () => {
    const lines = [line('comp', 0), line('fee', 500, 'fee')]
    const s = byUser(computeShares(lines, [claim('comp', 'x')], 'host'))
    expect(s.x.totalCents).toBe(0)
    expect(s.host.feesCents).toBe(500)
  })

  it('rejects non-integer cents rather than guessing', () => {
    expect(() => computeShares([line('a', 10.5)], [], 'host')).toThrow(/non-integer/)
  })

  it('always sums exactly to the bill, and each non-host is within a cent per category of their exact share', () => {
    let seed = 42
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))

    for (let trial = 0; trial < 2000; trial++) {
      const people = ['host', ...Array.from({ length: int(1, 7) }, (_, i) => `p${i}`)]
      const items = Array.from({ length: int(1, 12) }, (_, i) => line(`i${i}`, int(1, 6000)))
      if (rand() < 0.2) items.push(line('disc', -int(1, 500), 'discount'))
      const extras = [
        line('fee', int(0, 1500), 'fee'),
        line('tax', int(0, 900), 'tax'),
        line('tip', int(0, 2500), 'tip'),
        ...(rand() < 0.3 ? [line('adj', int(-300, 300), 'adjustment')] : []),
      ]
      // Every claimable line gets 1+ claimants, as lockBill requires.
      const claims = items.flatMap((it) => {
        const who = people.filter(() => rand() < 0.4)
        return (who.length ? who : [people[int(0, people.length - 1)]]).map((p) => claim(it.id, p))
      })
      const all = [...items, ...extras]
      const shares = computeShares(all, claims, 'host')
      const billTotal = all.reduce((s, l) => s + l.priceCents, 0)
      expect(sum(shares)).toBe(billTotal)
      for (const s of shares) {
        expect(s.totalCents).toBe(s.subtotalCents + s.feesCents + s.taxCents + s.tipCents + s.adjustmentCents)
      }

      // Exact (floating) share of each non-host, for the ±1¢-per-category bound.
      const subtotal = items.reduce((s, l) => s + l.priceCents, 0)
      for (const s of shares.filter((x) => x.userId !== 'host')) {
        const exactSub = items.reduce((acc, it) => {
          const who = claims.filter((c) => c.itemId === it.id).map((c) => c.userId)
          const unique = [...new Set(who)]
          return unique.includes(s.userId) ? acc + it.priceCents / unique.length : acc
        }, 0)
        expect(Math.abs(s.subtotalCents - exactSub)).toBeLessThanOrEqual(0.5 + 1e-9)
        if (subtotal > 0) {
          const exactTip = (extras.find((e) => e.kind === 'tip')!.priceCents * exactSub) / subtotal
          expect(Math.abs(s.tipCents - exactTip)).toBeLessThanOrEqual(0.5 + 1e-9)
        }
      }
    }
  })
})
