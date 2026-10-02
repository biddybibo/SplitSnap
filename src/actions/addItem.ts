/**
 * addItem — host-only: add a line the AI missed, the tip, or an adjustment.
 * Members can't create `items` directly (see bill-room-schemas.ts), so this is
 * the only way new lines appear after parsing.
 */

import type { ActionHandler } from 'deepspace/worker'
import { createActionTools } from '../server/action-tools'
import type { Env } from '../../worker'

const KINDS = ['item', 'discount', 'fee', 'tip', 'adjustment'] as const
const MAX_ABS_CENTS = 10_000_000 // $100,000: far above any real bill, blocks absurd values

export const addItem: ActionHandler<Env> = async ({ userId, params, tools, env, callerJwt }) => {
  const { billId, name, priceCents, kind, qty } = params
  if (typeof billId !== 'string' || !/^[0-9a-f-]{36}$/.test(billId)) {
    return { success: false, error: 'Invalid bill' }
  }
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

  // Host check against the app-room index, the authority for who owns a bill.
  const bill = await tools.get<{ hostId: string; status: string }>('bills', billId)
  if (!bill.success) return { success: false, error: 'Bill not found' }
  if (bill.data.record.data.hostId !== userId) return { success: false, error: 'Only the host can add lines' }
  if (bill.data.record.data.status === 'locked') return { success: false, error: 'This bill is locked' }

  const billTools = createActionTools(env, userId, callerJwt, `bill:${billId}`)
  // hostId is userBound: the room stamps the caller, who we just checked is the host.
  const created = await billTools.create('items', { name: name.trim(), qty: quantity, priceCents, kind })
  if (!created.success) return { success: false, error: 'Could not add the line; try again' }
  return { success: true, data: { recordId: created.data.recordId } }
}
