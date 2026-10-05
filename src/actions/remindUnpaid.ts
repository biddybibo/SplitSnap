/**
 * remindUnpaid — host-only, after lock: email a reminder to people who still owe.
 *
 * Emails are read here, on the server, and never leave it: the reply lists names
 * and outcomes only (CLAUDE.md: "emails never returned to client"). At most one
 * email per person every 6 hours (the `reminders` collection, server-written only).
 * Guests have no email; the host texts them from their own phone instead.
 * Sent through the platform's email integration (Resend) from the shared
 * app.space sender, billed to the app owner.
 */

import type { ActionHandler } from 'deepspace/worker'
import { formatCents } from '../lib/money'
import { canEmailAgain, reminderText } from '../lib/reminders'
import { amountOwed, type RouletteResult } from '../lib/roulette'
import { requireHost } from '../server/bill-access'
import type { Env } from '../../worker'

const FROM = 'SplitSnap <noreply@app.space>'

type RouletteRow = { loserId: string; mode: RouletteResult['mode']; entrantIds: string[] }

type Outcome = { name: string; result: 'sent' | 'paid' | 'nothing owed' | 'reminded recently' | 'no email' | 'failed' }

export const remindUnpaid: ActionHandler<Env> = async (ctx) => {
  const host = await requireHost(ctx, ctx.params.billId, { action: 'send reminders', allowLocked: true })
  if (!host.ok) return { success: false, error: host.error }
  if (!host.lockedAt) return { success: false, error: 'Lock the bill first, so the amounts are final' }
  const only = ctx.params.userId
  if (only !== undefined && (typeof only !== 'string' || only.length > 100)) return { success: false, error: 'Invalid person' }

  const { room } = host
  const [receipt, seats, shares, roulette, reminders] = await Promise.all([
    room.get<{ merchant: string }>('receipt', 'receipt'),
    room.query<{ userId: string; displayName: string; paid: number }>('participants', { limit: 200 }),
    room.query<{ userId: string; totalCents: number }>('shares', { limit: 500 }),
    room.get<RouletteRow>('rouletteResult', 'result'),
    room.query<{ userId: string; sentAt: string }>('reminders', { limit: 500 }),
  ])
  if (!receipt.success || !seats.success || !shares.success || !reminders.success) {
    return { success: false, error: 'Could not read the bill; try again' }
  }
  const merchant = receipt.data.record.data.merchant
  const total = new Map(shares.data.records.map((r) => [r.data.userId, r.data.totalCents]))
  const result = roulette.success ? roulette.data.record.data : null
  const lastSent = new Map(reminders.data.records.map((r) => [r.data.userId, r.data.sentAt]))
  const hostName = seats.data.records.find((p) => p.data.userId === ctx.userId)?.data.displayName ?? 'your host'
  const url = `https://${ctx.env.APP_NAME}.app.space/b/${host.billId}`

  const outcomes: Outcome[] = []
  for (const p of seats.data.records.map((r) => r.data)) {
    if (p.userId === ctx.userId || (only && p.userId !== only)) continue
    const owed = amountOwed(p.userId, ctx.userId, (id) => total.get(id) ?? 0, result)
    const name = p.displayName
    if (p.paid) { outcomes.push({ name, result: 'paid' }); continue }
    if (owed <= 0) { outcomes.push({ name, result: 'nothing owed' }); continue }
    if (!canEmailAgain(lastSent.get(p.userId))) { outcomes.push({ name, result: 'reminded recently' }); continue }

    const user = await ctx.tools.get<{ email?: string }>('users', p.userId)
    const email = user.success ? user.data.record.data.email : undefined
    if (!email || !email.includes('@')) { outcomes.push({ name, result: 'no email' }); continue }

    const text = reminderText({ name, hostName, merchant, amountCents: owed, url })
    const sent = await ctx.tools.integration('email/send', {
      from: FROM,
      to: email,
      subject: `Reminder: ${formatCents(owed)} to ${hostName} for ${merchant}`,
      text: `${text}\n\nSent by ${hostName} via SplitSnap.`,
    })
    if (!sent.success) {
      console.error('[remindUnpaid] send failed', { bill: host.billId, error: sent.error }) // no address in logs
      outcomes.push({ name, result: 'failed' })
      continue
    }
    await room.create('reminders', { userId: p.userId, sentAt: new Date().toISOString() }, `rem-${p.userId.replace(/[^A-Za-z0-9_-]/g, '_')}`)
    outcomes.push({ name, result: 'sent' })
  }
  console.info(`[remindUnpaid] host=${ctx.userId} bill=${host.billId} sent=${outcomes.filter((o) => o.result === 'sent').length}`)
  return { success: true, data: { outcomes } }
}
