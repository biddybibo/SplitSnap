/**
 * Start screen: snap or upload a receipt, then land on its review screen.
 * Signed-out visitors see what the app does and a sign-in button; scanning is
 * owner-billed, so the scan controls only exist for signed-in users.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthOverlay, useAsyncResource, useAuth, useQuery, useR2Files } from 'deepspace'
import { Camera, Trash2 } from 'lucide-react'
import { ScanningScreen, type ScanStage } from '@/components/scan/ScanningScreen'
import { Button, ConfirmModal, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import { parsePrintedAt, shortDay } from '@/lib/dates'
import { resizeToJpegBase64 } from '@/lib/image'
import { takeReturnPath } from '@/lib/returnTo'
import { cn } from '@/lib/utils'

interface Bill {
  title: string
  hostId: string
  status: 'review' | 'locked'
  totalCents: number
  participantIds?: string[]
  printedAt?: string
}

interface ParseResult {
  billId: string
  itemCount: number
  check: { offByCents: number }
  duplicateOf: { billId: string; title: string; printedAt: string; createdAt: string; strength: 'exact' | 'likely' } | null
}

export default function HomePage() {
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()

  // Back from sign-in that started on a shared bill link: go to that bill.
  useEffect(() => {
    if (!isSignedIn) return
    const path = takeReturnPath()
    if (path) navigate(path, { replace: true })
  }, [isSignedIn, navigate])

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 pb-12 pt-3">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-[30px] font-semibold leading-[1.1] tracking-tight">
          Snap it. Share it. Everyone picks their own.
        </h1>
        <p className="text-muted-foreground">No more passing one phone around the table.</p>
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
    <section className="flex flex-col items-center gap-4 rounded-2xl border-[1.5px] border-dashed border-input bg-card px-5 py-6 text-center">
      <CameraBadge />
      <p className="text-muted-foreground">Sign in to start a bill, or to join one a friend shared.</p>
      <Button size="lg" className="h-[50px] w-full text-base" onClick={() => setShowAuth(true)}>
        Sign in
      </Button>
      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </section>
  )
}

function CameraBadge() {
  return (
    <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft">
      <Camera className="size-7 text-primary" strokeWidth={1.8} aria-hidden />
    </span>
  )
}

function ScanReceipt() {
  const navigate = useNavigate()
  const { uploadBase64, deleteFile } = useR2Files() // default `self` scope: only the host can read the photo
  const toast = useToast()
  const [resolvingDuplicate, setResolvingDuplicate] = useState(false)
  const cameraInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [stage, setStage] = useState<ScanStage>('uploading')

  const scans = useAsyncResource(
    (signal) => callAction<{ remaining: number; limit: number }>('scansLeft', {}, signal),
    [],
  )

  useEffect(() => {
    if (!photo) return
    const url = URL.createObjectURL(photo)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  // Each attempt costs one of the day's parses, so never retry automatically.
  const parse = useAsyncResource<ParseResult>(
    async (signal) => {
      setStage('uploading')
      const imageBase64 = await resizeToJpegBase64(photo!)
      // The photo is a convenience for the review screen; a failed upload shouldn't block the bill.
      const uploaded = await uploadBase64(imageBase64, `receipts/${crypto.randomUUID()}.jpg`, 'image/jpeg')
      setStage('reading')
      const result = await callAction<ParseResult>(
        'parseReceipt',
        { imageBase64, mimeType: 'image/jpeg', imageId: uploaded.success ? uploaded.key : undefined },
        signal,
      )
      setStage('checking')
      // A beat on "checking" so the result registers before the button appears.
      await new Promise((r) => setTimeout(r, 700))
      setStage('ready')
      return result
    },
    [photo],
    { enabled: photo !== null, retry: 0, slowAfterMs: 8000 },
  )

  const { reload: reloadScans } = scans
  useEffect(() => {
    if (parse.status === 'error' || parse.status === 'ready') reloadScans()
  }, [parse.status, reloadScans])

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) setPhoto(file)
  }

  const outOfScans = scans.data?.remaining === 0

  return (
    <section className="flex flex-col items-center gap-3.5 rounded-2xl border-[1.5px] border-dashed border-input bg-card px-5 py-6">
      {/* capture= opens the camera directly on phones; the second input offers the photo library. */}
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />
      <input ref={libraryInput} type="file" accept="image/*" hidden onChange={onPick} />

      {photo && previewUrl && (
        <ScanningScreen
          photoUrl={previewUrl}
          stage={parse.status === 'error' ? 'error' : stage}
          itemCount={parse.data?.itemCount ?? null}
          addsUp={parse.data ? parse.data.check.offByCents === 0 : null}
          slow={parse.isSlow}
          error={parse.error}
          // Closing stops waiting; if the AI already answered, the bill still appears under Your bills.
          onCancel={() => setPhoto(null)}
          onReview={() => parse.data && navigate(`/b/${parse.data.billId}`)}
          onRetry={parse.reload}
          onDifferentPhoto={() => libraryInput.current?.click()}
          duplicate={parse.data?.duplicateOf ?? null}
          resolvingDuplicate={resolvingDuplicate}
          onOpenEarlier={async () => {
            const result = parse.data
            if (!result?.duplicateOf) return
            setResolvingDuplicate(true)
            try {
              // Drop the copy we just made (and its photo), then go to the original.
              const del = await callAction<{ imageId: string | null }>('deleteBill', { billId: result.billId })
              if (del.imageId) await deleteFile(del.imageId).catch(() => {})
              navigate(`/b/${result.duplicateOf.billId}`)
            } catch (err) {
              toast.error("Couldn't remove the duplicate", err instanceof Error ? err.message : undefined)
              setResolvingDuplicate(false)
            }
          }}
        />
      )}

      <CameraBadge />
      <div className="flex flex-col items-center gap-1 text-center">
        <h2 className="font-display text-[19px] font-semibold">Snap the receipt</h2>
        <p className="text-sm text-muted-foreground">We read the items. You fix anything we miss.</p>
      </div>
      <div className="flex w-full flex-col gap-2.5">
        <Button size="lg" className="h-[50px] text-base" disabled={outOfScans} onClick={() => cameraInput.current?.click()}>
          Take photo
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-[50px] bg-card text-base"
          disabled={outOfScans}
          onClick={() => libraryInput.current?.click()}
        >
          Upload an image
        </Button>
      </div>
      {scans.data && (
        <p className={cn('text-[13px]', outOfScans ? 'text-warning' : 'text-muted-foreground')}>
          {outOfScans
            ? 'No scans left today. They reset at 8 PM Eastern.'
            : `${scans.data.remaining} of ${scans.data.limit} scans left today`}
        </p>
      )}
    </section>
  )
}

function MyBills() {
  const { userId } = useAuth()
  const { records, status } = useQuery<Bill>('bills', { orderBy: 'createdAt', orderDir: 'desc', limit: 20 })
  const { deleteFile } = useR2Files()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [toDelete, setToDelete] = useState<{ id: string; title: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  if (status === 'loading') return null
  if (status === 'error') {
    return <p className="text-sm text-muted-foreground">Couldn&apos;t load your bills.</p>
  }
  if (records.length === 0) return null
  const hostsAny = records.some((b) => b.data.hostId === userId)

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      const res = await callAction<{ imageId: string | null }>('deleteBill', { billId: toDelete.id })
      if (res.imageId) await deleteFile(res.imageId).catch(() => {})
      setToDelete(null)
    } catch (err) {
      toast.error("Couldn't delete the bill", err instanceof Error ? err.message : undefined)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">Your bills</h2>
        {hostsAny && (
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="h-9 rounded-full px-3 text-[13px] font-semibold text-primary hover:bg-primary-soft"
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-2.5">
        {records.map((bill) => {
          const people = 1 + (bill.data.participantIds?.length ?? 0)
          const isHost = bill.data.hostId === userId
          const locked = bill.data.status === 'locked'
          const pill = locked
            ? isHost
              ? { label: 'Locked', className: 'bg-muted text-muted-foreground' }
              : { label: 'Settle up', className: 'bg-warning-soft text-warning' }
            : { label: 'Open', className: 'bg-primary-soft text-primary' }
          const title = bill.data.title || 'Untitled bill'
          return (
            <li key={bill.recordId} className="flex items-center gap-2">
              <Link
                to={`/b/${bill.recordId}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3.5 hover:border-input"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-semibold">{title}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {[shortDay(parsePrintedAt(bill.data.printedAt) ?? parsePrintedAt(bill.createdAt)), `${people} ${people === 1 ? 'person' : 'people'}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', pill.className)}>
                  {pill.label}
                </span>
              </Link>
              {editing && isHost && (
                <button
                  type="button"
                  aria-label={`Delete ${title}`}
                  onClick={() => setToDelete({ id: bill.recordId, title })}
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-destructive hover:bg-accent"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <ConfirmModal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title={`Delete ${toDelete?.title ?? 'this bill'}?`}
        description="Everyone on it loses access, and its items, picks and totals are removed. This can't be undone."
        confirmText="Delete bill"
      />
    </section>
  )
}
