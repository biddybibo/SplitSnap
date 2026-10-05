/**
 * addItem — host-only: add a line the AI missed, the tip, or an adjustment.
 * Members can't create `items` directly (see bill-room-schemas.ts), so this is
 * the only way new lines appear after parsing.
 */

import type { ActionHandler } from 'deepspace/worker'
import { requireHost } from '../server/bill-access'
import type { Env } from '../../worker'

const KINDS = ['item', 'discount', 'fee', 'tip', 'adjustment', 'hostAdjustment'] as const
const MAX_ABS_CENTS = 10_000_000 // $100,000: far above any real bill, blocks absurd values

export const addItem: ActionHandler<Env> = async (ctx) => {
  const { billId, name, priceCents, kind, qty } = ctx.params
  if (typeof kind !== 'string' || !(KINDS as readonly string[]).includes(kind)) {
    return { success: false, error: 'Invalid line kind' }
  }
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 120) {
    return { success: false, error: 'Name must be 1–120 characters' }
  }
  if (typeof priceCents !== 'number' || !Number.isInteger(priceCents) || Math.abs(priceCents) > MAX_ABS_CENTS) {
    return { success: false, error: 'Price must be a whole number of cents' }
  }
  const quantity = qty === undefined ? 1 : qty
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    return { success: false, error: 'Quantity must be 1–999' }
  }

  const host = await requireHost(ctx, billId, { action: 'add lines' })
  if (!host.ok) return { success: false, error: host.error }
  // hostId is userBound: the room stamps the caller, who requireHost just checked is the host.
  const created = await host.room.create('items', { name: name.trim(), qty: quantity, priceCents, kind })
  if (!created.success) return { success: false, error: 'Could not add the line; try again' }
  return { success: true, data: { recordId: created.data.recordId } }
}
