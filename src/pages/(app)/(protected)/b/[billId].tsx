/**
 * Bill screen at /b/<billId>. Mounts the bill's own room; `isolated` keeps its
 * collections from colliding with the same names registered in the app room.
 *
 * Which screen: the host reviews the receipt until they first share (sharing
 * gives them a participants row), then everyone, host included, claims.
 * `?edit=1` takes the host back to the review; `?view=split` is the preview.
 */

import { RecordScope, useAuth, useQuery } from 'deepspace'
import { useParams, useSearchParams } from 'react-router-dom'
import { ClaimScreen } from '@/components/bill/ClaimScreen'
import { ReviewScreen } from '@/components/bill/ReviewScreen'
import { SplitPreview } from '@/components/bill/SplitPreview'
import type { Participant } from '@/components/bill/Table'
import type { ReceiptRow } from '@/components/bill/types'
import {
  claimsSchema,
  itemsSchema,
  participantsSchema,
  receiptSchema,
} from '../../../../schemas/bill-room-schemas'

export default function BillPage() {
  const { billId } = useParams()
  if (!billId) return null
  return (
    <RecordScope roomId={`bill:${billId}`} schemas={[receiptSchema, itemsSchema, participantsSchema, claimsSchema]} isolated>
      <BillRouter billId={billId} />
    </RecordScope>
  )
}

function BillRouter({ billId }: { billId: string }) {
  const { userId } = useAuth()
  const [params] = useSearchParams()
  const receiptQuery = useQuery<ReceiptRow>('receipt')
  const participantsQuery = useQuery<Participant>('participants')

  if (receiptQuery.status === 'loading' || participantsQuery.status === 'loading') {
    return <p className="px-5 py-10 text-center text-muted-foreground">Loading the bill…</p>
  }
  const receipt = receiptQuery.records[0]?.data
  // ReviewScreen renders the not-found / error states.
  if (!receipt) return <ReviewScreen billId={billId} />

  const isHost = receipt.hostId === userId
  const hostSeated = participantsQuery.records.some((p) => p.data.userId === receipt.hostId)

  if (params.get('view') === 'split') return <SplitPreview billId={billId} />
  if (isHost && (!hostSeated || params.get('edit') === '1')) return <ReviewScreen billId={billId} />
  return <ClaimScreen billId={billId} />
}
