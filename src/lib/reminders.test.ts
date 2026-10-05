import { describe, expect, it } from 'vitest'
import { canEmailAgain, groupReminderText, reminderText } from './reminders'

describe('reminders', () => {
  it('writes the personal reminder', () => {
    expect(reminderText({ name: 'Felix', hostName: 'Hana', merchant: 'Break-It Diner', amountCents: 654, url: 'https://x/b/1' })).toBe(
      'Hey Felix, you still owe Hana $6.54 for Break-It Diner. Pay here: https://x/b/1',
    )
  })
  it('lists everyone in the group reminder', () => {
    const t = groupReminderText({ hostName: 'Hana', merchant: 'Diner', url: 'u', owing: [{ name: 'Felix', amountCents: 654 }, { name: 'Gina', amountCents: 763 }] })
    expect(t).toContain('• Felix: $6.54')
    expect(t).toContain('• Gina: $7.63')
  })
  it('emails at most once every 6 hours', () => {
    const now = new Date('2026-10-05T18:00:00Z').getTime()
    expect(canEmailAgain(null, now)).toBe(true)
    expect(canEmailAgain('2026-10-05T13:00:00Z', now)).toBe(false)
    expect(canEmailAgain('2026-10-05T11:59:00Z', now)).toBe(true)
  })
})
