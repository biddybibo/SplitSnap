/**
 * Bill screen at /b/<billId>. Mounts the bill's own room; `isolated` keeps its
 * collections from colliding with the same names registered in the app room.
 */

import { RecordScope } from 'deepspace'
import { useParams } from 'react-router-dom'
import { ReviewScreen } from '@/components/bill/ReviewScreen'
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
      <ReviewScreen billId={billId} />
    </RecordScope>
  )
}
