/**
 * SPIKE — throwaway test page for the parseReceipt action. Delete with the spike.
 */

import { useState } from 'react'
import { getAuthToken } from 'deepspace'

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

export default function SpikePage() {
  const [busy, setBusy] = useState(false)
  const [output, setOutput] = useState('')

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
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
      const json = await res.json()
      const kb = Math.round((imageBase64.length * 3) / 4 / 1024)
      setOutput(`HTTP ${res.status} · ${kb} KB sent · ${Date.now() - started} ms\n\n${JSON.stringify(json, null, 2)}`)
    } catch (err) {
      setOutput(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>parseReceipt spike</h1>
      <input type="file" accept="image/*" onChange={onFile} disabled={busy} />
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{output}</pre>
    </div>
  )
}
