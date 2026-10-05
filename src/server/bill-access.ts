/**
 * The one place host-only actions check who's allowed. Every action that changes
 * a bill on the host's behalf (addItem, assignItem, lockBill, addGuest,
 * removeGuest, setGuestPaid) calls requireHost first.
 *
 * The host is read from the app-room `bills` index (written once by
 * parseReceipt, with hostId stamped from the verified caller), never from params.
 */

import type { ActionTools } from 'deepspace/worker'
import { isBillId } from '../shared/ids'
import { createActionTools } from './action-tools'
import type { Env } from '../../worker'

export type HostAccess =
  | { ok: true; billId: string; room: ActionTools; lockedAt: string | null }
  | { ok: false; error: string }

interface Caller {
  tools: ActionTools
  env: Env
  userId: string
  callerJwt: string
}

export async function requireHost(
  { tools, env, userId, callerJwt }: Caller,
  billId: unknown,
  { action, allowLocked = false }: { action: string; allowLocked?: boolean },
): Promise<HostAccess> {
  if (!isBillId(billId)) return { ok: false, error: 'Invalid bill' }
  const bill = await tools.get<{ hostId: string }>('bills', billId)
  if (!bill.success) return { ok: false, error: 'Bill not found' }
  if (bill.data.record.data.hostId !== userId) return { ok: false, error: `Only the host can ${action}` }

  const room = createActionTools(env, userId, callerJwt, `bill:${billId}`)
  const receipt = await room.get<{ lockedAt?: string }>('receipt', 'receipt')
  if (!receipt.success) return { ok: false, error: 'Could not read the bill; try again' }
  const lockedAt = receipt.data.record.data.lockedAt || null
  if (lockedAt && !allowLocked) return { ok: false, error: 'This bill is locked' }
  return { ok: true, billId, room, lockedAt }
}
