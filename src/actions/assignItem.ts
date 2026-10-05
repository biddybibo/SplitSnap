/**
 * assignItem — host-only: decide who had a line ("Who had it?", "Split with
 * everyone", or a full "by how many" split). Replaces every claim on the line.
 *
 * Normal claims stay self-only (userBound + immutable userId). This action is the
 * one sanctioned exception: it verifies the caller is the bill's host, that every
 * target already has a seat at the table, and then writes each claim *as that
 * person* (the room stamps their id), so the rows look exactly like their own taps.
 *
 * Guests (`guest:<guestId>`, host-added) get rows in `guestClaims` instead — this is
 * the "claimForGuest" path, so guests and signed-in people can share one line.
 */

import type { ActionHandler } from 'deepspace/worker'
import { createActionTools } from '../server/action-tools'
import { requireHost } from '../server/bill-access'
import type { Env } from '../../worker'

type ItemRow = { kind: string; qty?: number }
type Assignment = { userId: string; units?: number }

export const assignItem: ActionHandler<Env> = async (ctx) => {
  const { userId, params, env, callerJwt } = ctx
  const { billId, itemId, assignments } = params
  if (typeof itemId !== 'string' || itemId.length > 100) return { success: false, error: 'Invalid item' }
  if (!Array.isArray(assignments) || assignments.length > 50) return { success: false, error: 'Invalid assignments' }

  const list: Assignment[] = []
  for (const a of assignments as unknown[]) {
    if (typeof a !== 'object' || a === null) return { success: false, error: 'Invalid assignment' }
    const { userId: who, units } = a as Record<string, unknown>
    if (typeof who !== 'string' || who.length > 100) return { success: false, error: 'Invalid person' }
    if (units !== undefined && (typeof units !== 'number' || !Number.isInteger(units) || units < 1 || units > 999)) {
      return { success: false, error: 'Counts must be whole numbers' }
    }
    if (list.some((x) => x.userId === who)) return { success: false, error: 'Each person can appear once' }
    list.push({ userId: who, units: units as number | undefined })
  }

  const host = await requireHost(ctx, billId, { action: 'assign items' })
  if (!host.ok) return { success: false, error: host.error }
  const asHost = host.room
  const [item, seats, guests] = await Promise.all([
    asHost.get<ItemRow>('items', itemId),
    asHost.query<{ userId: string }>('participants', { limit: 500 }),
    asHost.query('guests', { limit: 500 }),
  ])
  if (!seats.success || !guests.success) return { success: false, error: 'Could not read the bill; try again' }
  if (!item.success) return { success: false, error: 'Item not found' }
  const kind = item.data.record.data.kind
  if (kind !== 'item' && kind !== 'discount') return { success: false, error: 'Only items can be assigned' }

  const seated = new Set([
    ...seats.data.records.map((r) => r.data.userId),
    ...guests.data.records.map((r) => `guest:${r.recordId}`),
  ])
  if (list.some((a) => !seated.has(a.userId))) return { success: false, error: 'Everyone assigned must be at the table' }

  const withUnits = list.filter((a) => a.units !== undefined).length
  if (withUnits !== 0 && withUnits !== list.length) return { success: false, error: 'Give everyone a count, or no one' }
  const qty = item.data.record.data.qty ?? 1
  if (withUnits > 0 && list.reduce((s, a) => s + (a.units ?? 0), 0) !== qty) {
    return { success: false, error: `Counts must add up to ${qty}` }
  }

  // Replace: clear the line's claims (paged, as deleteWhere caps each call), then write the new set.
  for (const collection of ['claims', 'guestClaims']) {
    for (;;) {
      const cleared = await asHost.deleteWhere(collection, { itemId }, 500)
      if (!cleared.success) return { success: false, error: 'Could not update the claims; try again' }
      if (cleared.data.deleted < 500) break
    }
  }
  for (const a of list) {
    if (a.userId.startsWith('guest:')) {
      const made = await asHost.create('guestClaims', { itemId, guestId: a.userId.slice(6), units: a.units ?? null })
      if (!made.success) return { success: false, error: 'Could not save every claim; try again' }
      continue
    }
    // Acting as the target: claims.userId is userBound, so the room stamps *their* id on the row.
    const asThem = createActionTools(env, a.userId, callerJwt, `bill:${host.billId}`)
    const made = await asThem.create('claims', { itemId, units: a.units ?? null })
    if (!made.success) return { success: false, error: 'Could not save every claim; try again' }
  }
  console.info(`[assignItem] host=${userId} bill=${host.billId} item=${itemId} people=${list.length}`)
  return { success: true, data: { assigned: list.length } }
}
