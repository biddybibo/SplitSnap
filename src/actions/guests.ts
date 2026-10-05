/**
 * Host-added guests: people at the table who won't sign in. Host-only.
 * Guests live in `guests`, their picks in `guestClaims` (written by assignItem);
 * members can't write either collection, so only these actions create them.
 * In shares and computeShares a guest is `guest:<guestId>`.
 */

import type { ActionHandler } from 'deepspace/worker'
import { requireHost } from '../server/bill-access'
import type { Env } from '../../worker'

const MAX_GUESTS = 20

export const addGuest: ActionHandler<Env> = async (ctx) => {
  const name = typeof ctx.params.displayName === 'string' ? ctx.params.displayName.trim() : ''
  if (name.length === 0 || name.length > 40) return { success: false, error: 'Name must be 1–40 characters' }
  const host = await requireHost(ctx, ctx.params.billId, { action: 'manage guests' })
  if (!host.ok) return { success: false, error: host.error }
  const existing = await host.room.query('guests', { limit: MAX_GUESTS + 1 })
  if (!existing.success) return { success: false, error: 'Could not add the guest; try again' }
  if (existing.data.records.length >= MAX_GUESTS) return { success: false, error: `Up to ${MAX_GUESTS} guests per bill` }
  const made = await host.room.create('guests', { displayName: name, paid: 0 })
  if (!made.success) return { success: false, error: 'Could not add the guest; try again' }
  return { success: true, data: { guestId: made.data.recordId } }
}

export const removeGuest: ActionHandler<Env> = async (ctx) => {
  const { guestId } = ctx.params
  if (typeof guestId !== 'string' || guestId.length > 100) return { success: false, error: 'Invalid guest' }
  const host = await requireHost(ctx, ctx.params.billId, { action: 'manage guests' })
  if (!host.ok) return { success: false, error: host.error }
  // Their picks first, so an item never points at a guest who no longer exists.
  for (;;) {
    const cleared = await host.room.deleteWhere('guestClaims', { guestId }, 500)
    if (!cleared.success) return { success: false, error: 'Could not remove the guest; try again' }
    if (cleared.data.deleted < 500) break
  }
  const removed = await host.room.remove('guests', guestId)
  if (!removed.success) return { success: false, error: 'Could not remove the guest; try again' }
  return { success: true, data: { removed: true } }
}

/** Guests can't tap "I paid" themselves, so the host records it — also after the bill is locked. */
export const setGuestPaid: ActionHandler<Env> = async (ctx) => {
  const { guestId, paid } = ctx.params
  if (typeof guestId !== 'string' || guestId.length > 100) return { success: false, error: 'Invalid guest' }
  if (typeof paid !== 'boolean') return { success: false, error: 'paid must be true or false' }
  const host = await requireHost(ctx, ctx.params.billId, { action: 'manage guests', allowLocked: true })
  if (!host.ok) return { success: false, error: host.error }
  const guest = await host.room.get('guests', guestId)
  if (!guest.success) return { success: false, error: 'Guest not found' }
  const updated = await host.room.update('guests', guestId, { paid: paid ? 1 : 0 })
  if (!updated.success) return { success: false, error: 'Could not save; try again' }
  return { success: true, data: { paid } }
}
