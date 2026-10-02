import { describe, expect, it } from 'vitest'
import { cleanHandle } from './fields'

describe('cleanHandle', () => {
  it.each([
    ['@maya-r', 'maya-r'],
    ['$MayaR', 'MayaR'],
    ['https://venmo.com/u/maya-r', 'maya-r'],
    ['venmo.com/maya-r', 'maya-r'],
    ['cash.app/$mayar', 'mayar'],
    ['https://www.paypal.me/mayar', 'mayar'],
    ['  maya r  ', 'mayar'],
    ['maya"><script>', 'mayascript'],
  ])('%j → %j', (input, out) => expect(cleanHandle(input)).toBe(out))
})
