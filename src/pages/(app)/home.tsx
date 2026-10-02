/**
 * Start screen: snap or upload a receipt, then land on its review screen.
 * Signed-out visitors see what the app does and a sign-in button; scanning is
 * owner-billed, so the scan controls only exist for signed-in users.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthOverlay, useAsyncResource, useAuth, useQuery, useR2Files } from 'deepspace'
import { Camera, ImageUp, Receipt, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui'
import { callAction } from '@/lib/actions'
import { resizeToJpegBase64 } from '@/lib/image'
import { formatCents } from '@/lib/money'

interface Bill {
  title: string
  status: 'review' | 'locked'
  totalCents: number
}

interface ParseResult {
  billId: string
}

export default function HomePage() {
  const { isSignedIn } = useAuth()

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8 px-5 pb-12 pt-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Split the check in a snap.</h1>
        <p className="text-muted-foreground">
          Photograph the receipt. Everyone taps what they had on their own phone and gets an exact
          amount with a pay link.
        </p>
      </header>
      {isSignedIn ? (
        <>
          <ScanReceipt />
          <MyBills />
        </>
      ) : (
        <SignedOutStart />
      )}
    </div>
  )
}

function SignedOutStart() {
  const [showAuth, setShowAuth] = useState(false)
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">Sign in to start a bill or join one.</p>
      <Button size="lg" onClick={() => setShowAuth(true)}>
        Sign in
      </Button>
      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </section>
  )
}

function ScanReceipt() {
  const navigate = useNavigate()
  const { uploadBase64 } = useR2Files() // default `self` scope: only the host can read the photo
  const cameraInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!photo) return
    const url = URL.createObjectURL(photo)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  // Each attempt costs one of the day's parses, so never retry automatically.
  const parse = useAsyncResource<ParseResult>(
    async (signal) => {
      const imageBase64 = await resizeToJpegBase64(photo!)
      // The photo is a convenience for the review screen; a failed upload shouldn't block the bill.
      const uploaded = await uploadBase64(imageBase64, `receipts/${crypto.randomUUID()}.jpg`, 'image/jpeg')
      return callAction<ParseResult>(
        'parseReceipt',
        { imageBase64, mimeType: 'image/jpeg', imageId: uploaded.success ? uploaded.key : undefined },
        signal,
      )
    },
    [photo],
    { enabled: photo !== null, retry: 0, slowAfterMs: 8000 },
  )

  useEffect(() => {
    if (parse.status === 'ready' && parse.data) navigate(`/b/${parse.data.billId}`)
  }, [parse.status, parse.data, navigate])

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) setPhoto(file)
  }

  const busy = parse.status === 'loading' || parse.status === 'ready'

  return (
    <section className="flex flex-col gap-3">
      {/* capture= opens the camera directly on phones; the second input offers the photo library. */}
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />
      <input ref={libraryInput} type="file" accept="image/*" hidden onChange={onPick} />

      {photo && previewUrl ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <div className="flex gap-4">
            <img
              src={previewUrl}
              alt="Your receipt"
              className="h-28 w-20 shrink-0 rounded-md border border-border object-cover"
            />
            <div className="flex min-w-0 flex-col justify-center gap-1" aria-live="polite">
              {busy && (
                <>
                  <p className="flex items-center gap-2 font-medium">
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                      aria-hidden
                    />
                    Reading the receipt…
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {parse.isSlow ? 'Long receipts take a few seconds more.' : 'This usually takes about 5 seconds.'}
                  </p>
                </>
              )}
              {parse.status === 'error' && (
                <>
                  <p className="font-medium text-destructive">Couldn&apos;t read that receipt</p>
                  <p className="text-sm text-muted-foreground">{parse.error}</p>
                </>
              )}
            </div>
          </div>
          {parse.status === 'error' && (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={parse.reload}>
                <RotateCcw /> Try again
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => libraryInput.current?.click()}>
                Different photo
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <Button size="lg" className="h-14 text-base" onClick={() => cameraInput.current?.click()}>
            <Camera className="size-5" /> Snap the receipt
          </Button>
          <Button variant="outline" size="lg" onClick={() => libraryInput.current?.click()}>
            <ImageUp /> Upload a photo
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Lay it flat in good light, with the total in the shot.
          </p>
        </>
      )}
    </section>
  )
}

function MyBills() {
  const { records, status } = useQuery<Bill>('bills', { orderBy: 'createdAt', orderDir: 'desc', limit: 20 })

  if (status === 'loading') return null
  if (status === 'error') {
    return <p className="text-sm text-muted-foreground">Couldn&apos;t load your bills.</p>
  }
  if (records.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">Your bills</h2>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
        {records.map((bill) => (
          <li key={bill.recordId}>
            <Link to={`/b/${bill.recordId}`} className="flex items-center gap-3 px-4 py-3">
              <Receipt className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{bill.data.title || 'Untitled bill'}</span>
              <span className="font-mono tabular-nums">{formatCents(bill.data.totalCents ?? 0)}</span>
              <span className="w-14 text-right text-xs text-muted-foreground">
                {bill.data.status === 'locked' ? 'Locked' : 'Open'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
