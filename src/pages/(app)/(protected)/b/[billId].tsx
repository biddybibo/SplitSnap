/**
 * Bill screen. STUB for the slice-3 checkpoint: proves the start screen lands
 * here with a real bill. The review screen replaces this next.
 */

import { RecordScope, useQuery } from 'deepspace'
import { useParams } from 'react-router-dom'
import { itemsSchema, receiptSchema } from '../../../../schemas/bill-room-schemas'
import { formatCents } from '@/lib/money'

interface Item {
  name: string
  priceCents: number
  kind: string
}

interface ReceiptRow {
  merchant: string
  printedTotalCents: number
}

export default function BillPage() {
  const { billId } = useParams()
  if (!billId) return null
  return (
    <RecordScope roomId={`bill:${billId}`} schemas={[receiptSchema, itemsSchema]} isolated>
      <BillStub />
    </RecordScope>
  )
}

function BillStub() {
  const receipt = useQuery<ReceiptRow>('receipt')
  const items = useQuery<Item>('items', { orderBy: 'createdAt', orderDir: 'asc' })

  if (receipt.status === 'loading' || items.status === 'loading') {
    return <p className="p-5 text-muted-foreground">Loading bill…</p>
  }
  const r = receipt.records[0]?.data
  if (!r) return <p className="p-5 text-muted-foreground">This bill doesn&apos;t exist, or it&apos;s still being created.</p>

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 py-8">
      <h1 className="text-2xl font-semibold">{r.merchant}</h1>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
        {items.records.map((i) => (
          <li key={i.recordId} className="flex justify-between px-4 py-3">
            <span>{i.data.name}</span>
            <span className="font-mono tabular-nums">{formatCents(i.data.priceCents)}</span>
          </li>
        ))}
      </ul>
      <p className="flex justify-between px-4 font-medium">
        <span>Printed total</span>
        <span className="font-mono tabular-nums">{formatCents(r.printedTotalCents)}</span>
      </p>
      <p className="text-sm text-muted-foreground">Review screen coming next.</p>
    </div>
  )
}
