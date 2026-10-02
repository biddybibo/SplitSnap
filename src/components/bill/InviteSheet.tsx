/**
 * "Invite friends" bottom sheet (design: Invite.dc.html). Replaces the OS share
 * sheet as the first step; "More" still hands off to it for anything else.
 */

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Mail, MessageCircle, MessageSquare, MoreHorizontal, X } from 'lucide-react'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import { Avatar, type Participant } from './Table'

interface InviteSheetProps {
  billId: string
  merchant: string
  totalCents: number
  hostName: string
  hostId: string
  people: Participant[]
  hereIds: Set<string>
  onClose: () => void
}

const MARK_LEFT = 'M28 16H57V94L53.375 100L49.75 94L46.125 100L42.5 94L38.875 100L35.25 94L31.625 100L28 94Z'
const MARK_RIGHT = 'M63 24H92V102L88.375 108L84.75 102L81.125 108L77.5 102L73.875 108L70.25 102L66.625 108L63 102Z'

export function InviteSheet(props: InviteSheetProps) {
  const { billId, merchant, totalCents, hostName, hostId, people, hereIds, onClose } = props
  const url = `${window.location.origin}/b/${billId}`
  const shortUrl = url.replace(/^https?:\/\//, '')
  const [tab, setTab] = useState<'link' | 'qr'>('link')
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState(
    `${hostName} started a SplitSnap for ${merchant} (${formatCents(totalCents)}). Tap to pick what you had: ${url}`,
  )
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard blocked: the link stays visible and selectable in the field.
    }
  }

  const body = encodeURIComponent(message)
  const canShareNatively = typeof navigator !== 'undefined' && 'share' in navigator
  const channels = [
    // `sms:?&body=` is the form both iOS Messages and Android accept.
    { label: 'Text', href: `sms:?&body=${body}`, Icon: MessageSquare, tint: 'bg-primary-soft text-primary' },
    { label: 'WhatsApp', href: `https://wa.me/?text=${body}`, Icon: MessageCircle, tint: 'bg-success-soft text-success' },
    {
      label: 'Email',
      href: `mailto:?subject=${encodeURIComponent(`Split ${merchant} on SplitSnap`)}&body=${body}`,
      Icon: Mail,
      tint: 'bg-warning-soft text-warning',
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-foreground/55" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-title"
        className="relative mx-auto flex max-h-[92dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-[20px] bg-card px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2.5 animate-in"
      >
        <span className="h-1 w-10 self-center rounded-full bg-input" aria-hidden />
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-0.5">
            <h2 id="invite-title" className="font-display text-[22px] font-semibold">
              Invite friends
            </h2>
            <p className="text-[13px] text-muted-foreground">
              {merchant} · {formatCents(totalCents)} · {people.length} at the table
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-2.5 -mt-1.5 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
          >
            <X className="size-5" />
          </button>
        </div>

        <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(['link', 'qr'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                'h-10 rounded-[9px] text-sm font-semibold transition-colors',
                tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {t === 'link' ? 'Send a link' : 'Scan at the table'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-border py-1.5 pl-3.5 pr-1.5">
          <input
            readOnly
            aria-label="Bill link"
            value={shortUrl}
            onFocus={(e) => e.target.select()}
            className="min-w-0 flex-1 truncate bg-transparent font-mono text-[13.5px] outline-none"
          />
          <button
            type="button"
            onClick={copy}
            className={cn(
              'h-10 rounded-[9px] px-3.5 text-sm font-semibold transition-colors',
              copied ? 'bg-success-soft text-success' : 'bg-primary text-primary-foreground',
            )}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        {tab === 'link' ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-4 gap-2">
              {channels.map(({ label, href, Icon, tint }) => (
                <a
                  key={label}
                  href={href}
                  target={label === 'WhatsApp' ? '_blank' : undefined}
                  rel="noreferrer"
                  className="flex flex-col items-center gap-1.5 text-[12.5px] font-medium"
                >
                  <span className={cn('flex size-14 items-center justify-center rounded-2xl', tint)}>
                    <Icon className="size-[26px]" strokeWidth={1.8} />
                  </span>
                  {label}
                </a>
              ))}
              <button
                type="button"
                onClick={() =>
                  canShareNatively
                    ? navigator.share({ title: 'SplitSnap', text: message }).catch(() => {})
                    : void copy()
                }
                className="flex flex-col items-center gap-1.5 text-[12.5px] font-medium"
              >
                <span className="flex size-14 items-center justify-center rounded-2xl bg-muted">
                  <MoreHorizontal className="size-[26px]" strokeWidth={1.8} />
                </span>
                More
              </button>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-muted-foreground">Message they&apos;ll get</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={500}
                className="resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-base leading-snug"
              />
            </label>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2.5 py-1">
            <QrCode value={url} />
            <p className="text-sm text-muted-foreground">Have a friend point their camera here.</p>
          </div>
        )}

        <div className="h-px bg-muted" />

        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">At the table</h3>
          <ul className="flex flex-wrap gap-3.5">
            {people.map((p) => {
              const status = p.userId === hostId ? 'Host' : hereIds.has(p.userId) ? 'Here now' : 'Joined'
              return (
                <li key={p.userId} className="flex w-14 flex-col items-center gap-1">
                  <Avatar id={p.userId} name={p.displayName} size={36} />
                  <span className="max-w-full truncate text-xs">{p.displayName}</span>
                  <span
                    className={cn(
                      'text-[11.5px]',
                      status === 'Host' ? 'text-muted-foreground' : status === 'Here now' ? 'text-success' : 'text-muted-foreground',
                    )}
                  >
                    {status}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

/** A real, scannable QR code for the link, with the SplitSnap mark in the middle. */
function QrCode({ value }: { value: string }) {
  // Level H tolerates ~30% damage, so the centre logo (~13% of the area) still scans.
  const qr = QRCode.create(value, { errorCorrectionLevel: 'H' })
  const n = qr.modules.size
  const quiet = 2
  const dim = n + quiet * 2
  const cells: string[] = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.get(y, x)) cells.push(`M${x + quiet} ${y + quiet}h1v1h-1z`)
    }
  }
  const logo = dim * 0.26
  const logoAt = (dim - logo) / 2

  return (
    <div className="rounded-2xl border border-border bg-white p-3">
      <svg width={180} height={180} viewBox={`0 0 ${dim} ${dim}`} role="img" aria-label="QR code for the bill link" shapeRendering="crispEdges">
        <rect width={dim} height={dim} fill="#FFFFFF" />
        <path d={cells.join('')} fill="#16181D" />
        <rect x={logoAt - 0.6} y={logoAt - 0.6} width={logo + 1.2} height={logo + 1.2} rx={logo * 0.22} fill="#FFFFFF" />
        <rect x={logoAt} y={logoAt} width={logo} height={logo} rx={logo * 0.2} fill="#1F5FD1" />
        <g transform={`translate(${logoAt + logo * 0.15} ${logoAt + logo * 0.14}) scale(${(logo * 0.7) / 120})`}>
          <path d={MARK_LEFT} fill="#FFFFFF" />
          <path d={MARK_RIGHT} fill="#A9C2F2" />
        </g>
      </svg>
    </div>
  )
}
