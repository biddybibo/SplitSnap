/**
 * SPIKE — throwaway end-to-end check for the real parseReceipt: uploads a photo,
 * then reads the new bill's room back to prove the writes landed. Delete in slice 3.
 */

import { useState } from 'react'
import { getAuthToken, RecordScope, useQuery } from 'deepspace'
import {
  receiptSchema,
  itemsSchema,
} from '../../../schemas/bill-room-schemas'

const MAX_EDGE = 1600

async function resizeToJpegBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

function BillReadback() {
  const receipt = useQuery('receipt')
  const items = useQuery('items')
  return (
    <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
      {`Read back from the bill room (receipt: ${receipt.status}, items: ${items.status})\n\n`}
      {JSON.stringify(
        { receipt: receipt.records.map((r) => r.data), items: items.records.map((r) => r.data) },
        null,
        2,
      )}
    </pre>
  )
}

export default function SpikePage() {
  const [busy, setBusy] = useState(false)
  const [output, setOutput] = useState('')
  const [billId, setBillId] = useState<string | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setBillId(null)
    setOutput('Parsing…')
    const started = Date.now()
    try {
      const imageBase64 = await resizeToJpegBase64(file)
      const res = await fetch('/api/actions/parseReceipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg' }),
      })
      const json = (await res.json()) as { success: boolean; data?: { billId: string } }
      setOutput(`HTTP ${res.status} · ${Date.now() - started} ms\n\n${JSON.stringify(json, null, 2)}`)
      if (json.success && json.data) setBillId(json.data.billId)
    } catch (err) {
      setOutput(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>parseReceipt spike v2</h1>
      <input type="file" accept="image/*" onChange={onFile} disabled={busy} />
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{output}</pre>
      {billId && (
        <RecordScope roomId={`bill:${billId}`} schemas={[receiptSchema, itemsSchema]} isolated>
          <BillReadback />
        </RecordScope>
      )}
    </div>
  )
}
