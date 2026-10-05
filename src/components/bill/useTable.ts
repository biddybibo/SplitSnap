/**
 * Everyone at the table and everything they picked, guests included, in one
 * shape. A guest appears as `guest:<guestId>` (the id computeShares and shares
 * use); `isGuest` lets screens label them and route the host's edits through
 * the host-only actions.
 */

import { useQuery } from 'deepspace'
import type { ClaimRow } from '@/lib/claims'
import type { Participant } from './Table'

interface GuestRow {
  displayName: string
  paid: number
}

interface GuestClaimRow {
  itemId: string
  guestId: string
  units?: number | null
}

export interface Seat extends Participant {
  /** The participants / guests row id. */
  recordId: string
  isGuest: boolean
}

export interface TableClaim {
  recordId: string
  data: ClaimRow
  isGuest: boolean
}

export function useTable() {
  const participants = useQuery<Participant>('participants', { orderBy: 'createdAt', orderDir: 'asc' })
  const guests = useQuery<GuestRow>('guests', { orderBy: 'createdAt', orderDir: 'asc' })
  const claims = useQuery<ClaimRow>('claims')
  const guestClaims = useQuery<GuestClaimRow>('guestClaims')

  const people: Seat[] = [
    ...participants.records.map((p) => ({ ...p.data, recordId: p.recordId, isGuest: false })),
    ...guests.records.map((g) => ({
      userId: `guest:${g.recordId}`,
      displayName: g.data.displayName,
      paid: g.data.paid,
      recordId: g.recordId,
      isGuest: true,
    })),
  ]
  const allClaims: TableClaim[] = [
    ...claims.records.map((c) => ({ recordId: c.recordId, data: c.data, isGuest: false })),
    ...guestClaims.records.map((c) => ({
      recordId: c.recordId,
      data: { itemId: c.data.itemId, userId: `guest:${c.data.guestId}`, units: c.data.units ?? null },
      isGuest: true,
    })),
  ]
  const loading = [participants, guests, claims, guestClaims].some((q) => q.status === 'loading')
  return { people, claims: allClaims, loading, participantsReady: participants.status === 'ready' }
}
