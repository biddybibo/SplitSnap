/**
 * spinRoulette — host-only, once per bill, after lock. Everyone who tapped
 * "I'm in" (their own rouletteEntries row) is in; the server picks who covers the
 * lot with crypto randomness (even odds, or weighted by each person's share) and
 * saves the result where no one can edit or re-roll it. A lighthearted way to pick
 * who covers the bill — no stakes beyond the bill itself.
 */

import type { ActionHandler } from 'deepspace/worker'
import { cryptoRandomBelow, pickLoser, type RouletteMode } from '../lib/roulette'
import { requireHost } from '../server/bill-access'
import type { Env } from '../../worker'

export const spinRoulette: ActionHandler<Env> = async (ctx) => {
  const mode = ctx.params.mode as RouletteMode
  if (mode !== 'even' && mode !== 'weighted') return { success: false, error: 'Pick even or weighted' }
  const host = await requireHost(ctx, ctx.params.billId, { action: 'spin', allowLocked: true })
  if (!host.ok) return { success: false, error: host.error }
  if (!host.lockedAt) return { success: false, error: 'Lock the bill first, so everyone’s share is final' }

  const { room } = host
  const [existing, entries, seats, shares] = await Promise.all([
    room.get('rouletteResult', 'result'),
    room.query<{ userId: string }>('rouletteEntries', { limit: 200 }),
    room.query<{ userId: string; paid: number }>('participants', { limit: 200 }),
    room.query<{ userId: string; totalCents: number }>('shares', { limit: 500 }),
  ])
  if (existing.success) return { success: false, error: 'This bill already had its spin' }
  if (!entries.success || !seats.success || !shares.success) return { success: false, error: 'Could not read the bill; try again' }

  const seated = new Map(seats.data.records.map((r) => [r.data.userId, r.data]))
  const shareOf = new Map(shares.data.records.map((r) => [r.data.userId, r.data.totalCents]))
  const entrantIds = [...new Set(entries.data.records.map((r) => r.data.userId))].filter((id) => seated.has(id))
  if (entrantIds.length < 2) return { success: false, error: 'At least two people need to be in' }
  const paid = entrantIds.filter((id) => seated.get(id)!.paid)
  if (paid.length > 0) return { success: false, error: 'Someone who’s in has already paid; spin before anyone pays' }

  const loserId = pickLoser(
    entrantIds.map((id) => ({ id, weight: shareOf.get(id) ?? 0 })),
    mode,
    cryptoRandomBelow,
  )
  // Fixed record id + "already had its spin" check above = one draw per bill.
  const saved = await room.create('rouletteResult', { loserId, mode, entrantIds, drawnAt: new Date().toISOString() }, 'result')
  if (!saved.success) return { success: false, error: 'Could not save the spin; try again' }
  console.info(`[spinRoulette] host=${ctx.userId} bill=${host.billId} mode=${mode} entrants=${entrantIds.length}`)
  return { success: true, data: { loserId, entrantIds, mode } }
}
