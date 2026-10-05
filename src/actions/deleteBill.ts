/**
 * deleteBill — host-only: remove a bill (a duplicate scan, a wrong receipt, test
 * bills). Clears every collection in the bill's room, then the app-room index row,
 * so it disappears from everyone's "Your bills". Returns the photo key so the
 * host's browser can delete the private photo (only its owner can).
 */

import type { ActionHandler } from 'deepspace/worker'
import { requireHost } from '../server/bill-access'
import type { Env } from '../../worker'

const BILL_ROOM_COLLECTIONS = ['claims', 'guestClaims', 'shares', 'participants', 'guests', 'items', 'receipt']

export const deleteBill: ActionHandler<Env> = async (ctx) => {
  const host = await requireHost(ctx, ctx.params.billId, { action: 'delete the bill', allowLocked: true })
  if (!host.ok) return { success: false, error: host.error }

  const receipt = await host.room.get<{ imageId?: string }>('receipt', 'receipt')
  const imageId = receipt.success ? receipt.data.record.data.imageId || null : null

  for (const collection of BILL_ROOM_COLLECTIONS) {
    // Bill rooms are small (a table's worth of rows); page through until empty.
    for (let page = 0; page < 20; page++) {
      const rows = await host.room.query(collection, { limit: 200 })
      if (!rows.success) return { success: false, error: 'Could not delete the bill; try again' }
      if (rows.data.records.length === 0) break
      for (const r of rows.data.records) {
        const removed = await host.room.remove(collection, r.recordId)
        if (!removed.success) return { success: false, error: 'Could not delete the bill; try again' }
      }
    }
  }
  const index = await ctx.tools.remove('bills', host.billId)
  if (!index.success) return { success: false, error: 'Could not delete the bill; try again' }
  console.info(`[deleteBill] host=${ctx.userId} bill=${host.billId}`)
  return { success: true, data: { deleted: true, imageId } }
}
