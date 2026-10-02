import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rememberReturnPath, takeReturnPath } from './returnTo'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})

const bill = '/b/9464c52c-c619-45ca-a064-9ccb66e84c7b'

describe('return-to-bill after sign-in', () => {
  beforeEach(() => store.clear())

  it('returns a remembered bill path once', () => {
    rememberReturnPath(bill)
    expect(takeReturnPath()).toBe(bill)
    expect(takeReturnPath()).toBeNull()
  })

  it.each(['/home', 'https://evil.example/b/x', '//evil.example', '/b/../settings', `${bill}?x=1`])(
    'ignores %j',
    (path) => {
      rememberReturnPath(path)
      expect(takeReturnPath()).toBeNull()
    },
  )

  it('ignores a tampered stored value', () => {
    store.set('splitsnap:returnTo', JSON.stringify({ path: '//evil.example', at: Date.now() }))
    expect(takeReturnPath()).toBeNull()
  })

  it('expires after 10 minutes', () => {
    store.set('splitsnap:returnTo', JSON.stringify({ path: bill, at: Date.now() - 11 * 60 * 1000 }))
    expect(takeReturnPath()).toBeNull()
  })
})
