/** Reminder wording, shared by the email (server) and the text buttons (host's own Messages app). */

import { formatCents } from './money'

export const REMIND_EVERY_MS = 6 * 60 * 60 * 1000

export function reminderText(p: { name: string; hostName: string; merchant: string; amountCents: number; url: string }): string {
  return `Hey ${p.name}, you still owe ${p.hostName} ${formatCents(p.amountCents)} for ${p.merchant}. Pay here: ${p.url}`
}

export function groupReminderText(p: {
  hostName: string
  merchant: string
  url: string
  owing: { name: string; amountCents: number }[]
}): string {
  const lines = p.owing.map((o) => `• ${o.name}: ${formatCents(o.amountCents)}`).join('\n')
  return `Still to pay ${p.hostName} for ${p.merchant}:\n${lines}\nAmounts and pay links: ${p.url}`
}

/** May this person be emailed again? (At most once per REMIND_EVERY_MS.) */
export function canEmailAgain(lastSentAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastSentAt) return true
  const t = new Date(lastSentAt).getTime()
  return Number.isNaN(t) || now - t >= REMIND_EVERY_MS
}
