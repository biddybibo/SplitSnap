/**
 * "Reading your receipt" (design: Scanning.dc.html). Full-screen while a scan runs.
 * The steps follow real progress (upload done → AI answered → total checked), not
 * a timer; the photo is the user's own, with a scan line over it.
 */

import { Check } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

export type ScanStage = 'uploading' | 'reading' | 'checking' | 'ready' | 'error'

interface Props {
  photoUrl: string
  stage: ScanStage
  itemCount: number | null
  addsUp: boolean | null
  slow: boolean
  error: string | null
  onCancel: () => void
  onReview: () => void
  onRetry: () => void
  onDifferentPhoto: () => void
}

const ORDER: ScanStage[] = ['uploading', 'reading', 'checking', 'ready']

export function ScanningScreen(p: Props) {
  const at = ORDER.indexOf(p.stage)
  const steps = [
    'Photo uploaded',
    p.itemCount !== null ? `Found ${p.itemCount} ${p.itemCount === 1 ? 'item' : 'items'}` : 'Finding line items',
    p.addsUp === null ? 'Checking it adds up to the total' : p.addsUp ? 'Adds up to the total' : 'Something doesn’t add up — you’ll check it next',
    'Ready to review',
  ]

  return (
    <div className="fixed inset-0 z-50 flex flex-col gap-5 overflow-y-auto bg-[#16181D] px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1.1rem+env(safe-area-inset-top))] text-white">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold">Reading your receipt</h1>
        {p.stage !== 'ready' && (
          <button type="button" onClick={p.onCancel} className="h-10 rounded-lg px-3 text-sm font-semibold text-[#C9CCD3] hover:bg-white/10">
            Cancel
          </button>
        )}
      </div>

      <div className="relative mx-auto aspect-[2/3] w-[min(62vw,250px)] overflow-hidden rounded-md bg-[#F5F3EC]">
        <img src={p.photoUrl} alt="Your receipt" className="size-full object-cover object-top" />
        {(p.stage === 'uploading' || p.stage === 'reading') && (
          <div
            aria-hidden
            className="animate-scan-sweep absolute inset-x-0 h-0.5 bg-[#4F86E8] shadow-[0_0_14px_4px_rgba(79,134,232,0.45)]"
          />
        )}
        {p.stage === 'checking' || p.stage === 'ready' ? (
          <div aria-hidden className={cn('absolute inset-0 ring-2 ring-inset', p.addsUp === false ? 'ring-[#F2A65A]' : 'ring-[#4F86E8]')} />
        ) : null}
      </div>

      {p.stage === 'error' ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-[#22252C] p-4" role="alert">
          <p className="font-semibold text-[#FCA5A5]">Couldn&apos;t read that receipt</p>
          <p className="text-sm text-[#C9CCD3]">{p.error}</p>
          <div className="flex gap-2">
            <Button className="h-11 flex-1" onClick={p.onRetry}>
              Try again
            </Button>
            <Button variant="outline" className="h-11 flex-1 border-white/20 bg-transparent text-white hover:bg-white/10" onClick={p.onDifferentPhoto}>
              Different photo
            </Button>
          </div>
        </div>
      ) : (
        <ol className="flex flex-col gap-3 rounded-2xl bg-[#22252C] p-4" aria-live="polite">
          {steps.map((label, i) => {
            const done = i < at || p.stage === 'ready'
            const active = i === at && p.stage !== 'ready'
            return (
              <li key={i} className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex size-[22px] shrink-0 items-center justify-center rounded-full',
                    done ? 'bg-[#4F86E8] text-[#16181D]' : active ? 'border-2 border-[#4F86E8]' : 'border-2 border-[#4A4E57]',
                  )}
                >
                  {done && <Check className="size-3.5" strokeWidth={3} />}
                </span>
                <span className={cn('text-[15px]', done || active ? 'text-white' : 'text-[#7D828C]', active && 'font-semibold')}>{label}</span>
              </li>
            )
          })}
        </ol>
      )}

      <div className="flex-1" />
      {p.stage === 'ready' ? (
        <Button size="lg" className="h-[52px] text-base" onClick={p.onReview} autoFocus>
          Review {p.itemCount ?? ''} {p.itemCount === 1 ? 'item' : 'items'}
        </Button>
      ) : p.stage !== 'error' ? (
        <p className="text-center text-[13px] text-[#9EA3AD]">
          {p.slow ? 'Long receipts take a few seconds more.' : 'This takes a few seconds. You’ll check everything next.'}
        </p>
      ) : null}
    </div>
  )
}
