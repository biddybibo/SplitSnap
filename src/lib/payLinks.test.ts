import { describe, expect, it } from 'vitest'
import { payLinks } from './payLinks'

describe('payLinks', () => {
  const all = { payVenmo: 'maya-r', payCashApp: 'mayar', payPaypal: 'mayar' }

  it('prefills each app with the amount', () => {
    expect(payLinks(all, 3339, 'Taqueria Luna')).toEqual([
      { app: 'Venmo', href: 'https://venmo.com/?txn=pay&recipients=maya-r&amount=33.39&note=Taqueria%20Luna' },
      { app: 'Cash App', href: 'https://cash.app/$mayar/33.39' },
      { app: 'PayPal', href: 'https://paypal.me/mayar/33.39USD' },
    ])
  })

  it('only offers the apps the host set up', () => {
    expect(payLinks({ payVenmo: 'maya-r' }, 500, 'x').map((l) => l.app)).toEqual(['Venmo'])
  })

  it('offers nothing for $0 or a negative amount', () => {
    expect(payLinks(all, 0, 'x')).toEqual([])
    expect(payLinks(all, -5, 'x')).toEqual([])
  })

  it('refuses a handle that could inject into the URL', () => {
    expect(payLinks({ payVenmo: 'a&amount=0', payCashApp: '../x', payPaypal: 'ok' }, 500, 'x').map((l) => l.app)).toEqual([
      'PayPal',
    ])
  })
})
