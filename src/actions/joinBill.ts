/**
 * joinBill — the caller takes a seat at the table.
 *
 * Creates the caller's `participants` row in the bill room (userId is
 * userBound, so the room stamps the caller; uniqueOn [userId] makes a second
 * join a no-op) and adds them to `bills.participantIds` in the app room so the
 * bill shows in their list. Members can't write `bills`, hence an action.
 * The host calls it too (on first share) to get their own participants row;
 * they are never added to participantIds, since they already own the bill.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import { createActionTools } from '../server/action-tools'
import type { Env } from '../../worker'

type BillRow = {
  hostId: string
  status: string
  participantIds?: string[]
}

async function getBill(tools: ActionTools, billId: string): Promise<BillRow | null> {
  const r = await tools.get<BillRow>('bills', billId)
  return r.success ? r.data.record.data : null
}

export const joinBill: ActionHandler<Env> = async ({ userId, params, tools, env, callerJwt }) => {
  const { billId, displayName } = params
  if (typeof billId !== 'string' || !/^[0-9a-f-]{36}$/.test(billId)) {
    return { success: false, error: 'Invalid bill' }
  }
  const name = typeof displayName === 'string' ? displayName.trim() : ''
  if (name.length === 0 || name.length > 40) {
    return { success: false, error: 'Name must be 1–40 characters' }
  }

  const bill = await getBill(tools, billId)
  if (!bill) return { success: false, error: 'Bill not found' }
  if (bill.status === 'locked') return { success: false, error: 'This bill is already locked' }
  const isHost = bill.hostId === userId

  const billTools = createActionTools(env, userId, callerJwt, `bill:${billId}`)
  const existing = await billTools.query('participants', { where: { userId }, limit: 1 })
  if (!existing.success) return { success: false, error: 'Could not join; try again' }
  if (existing.data.records.length === 0) {
    const created = await billTools.create('participants', { displayName: name, paid: 0 })
    // A concurrent join by the same user loses to uniqueOn; that still means "joined".
    if (!created.success && !created.error.startsWith('Duplicate')) {
      return { success: false, error: 'Could not join; try again' }
    }
  }

  if (!isHost) {
    // bills.hostId is userBound. The docs disagree on whether userBound re-stamps on update,
    // so write this row *as the host* (an id read from the bill itself, never from params):
    // a friend's identity must never land in hostId.
    const asHost = createActionTools(env, bill.hostId, callerJwt)
    // participantIds is a read-modify-write on one row; two friends joining at the same
    // moment can overwrite each other, so re-read and retry until our id sticks.
    for (let attempt = 0; attempt < 4; attempt++) {
      const current = attempt === 0 ? bill : await getBill(tools, billId)
      if (!current) return { success: false, error: 'Bill not found' }
      const ids = current.participantIds ?? []
      if (ids.includes(userId)) break
      const updated = await asHost.update('bills', billId, { participantIds: [...ids, userId] })
      if (!updated.success) return { success: false, error: 'Could not join; try again' }
      const after = await getBill(tools, billId)
      if (after?.participantIds?.includes(userId)) break
    }
  }

  return { success: true, data: { joined: true } }
}
