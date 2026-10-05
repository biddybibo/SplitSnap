/**
 * Settle screen (design: Settle.dc.html), shown to everyone once the host locks.
 * Amounts come from the `shares` rows lockBill wrote — the server's snapshot,
 * not a client recomputation. "I paid" is each person's own participants row.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, useMutations, useQuery } from 'deepspace'
import { ChevronLeft } from 'lucide-react'
import { useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import { formatCents } from '@/lib/money'
import { payLinks } from '@/lib/payLinks'
import { amountOwed, type RouletteResult } from '@/lib/roulette'
import { cn } from '@/lib/utils'
import { HandleField } from './fields'
import { RouletteCard } from './RouletteCard'
import { Avatar, type Participant } from './Table'
import { useTable } from './useTable'
import type { ReceiptRow, ShareRow } from './types'

export function SettleScreen({ billId }: { billId: string }) {
  const { userId } = useAuth()
  const receipt = useQuery<ReceiptRow>('receipt').records[0]?.data
  const sharesQuery = useQuery<ShareRow>('shares')
  const table = useTable()
  const rouletteQuery = useQuery<RouletteResult & { drawnAt?: string }>('rouletteResult')
  const participantMutations = useMutations<Participant>('participants')
  const receiptMutations = useMutations<ReceiptRow>('receipt')
  const receiptId = useQuery<ReceiptRow>('receipt').records[0]?.recordId
  const toast = useToast()
  const [editingHandles, setEditingHandles] = useState(false)
  const [guestBusy, setGuestBusy] = useState<string | null>(null)

  if (!receipt || sharesQuery.status === 'loading' || table.loading) {
    return <p className="px-5 py-10 text-center text-muted-foreground">Loading the totals…</p>
  }

  const shares = sharesQuery.records.map((r) => r.data)
  const people = table.people
  const shareOf = (id: string) => shares.find((s) => s.userId === id)
  const isHost = receipt.hostId === userId
  const hostName = people.find((p) => p.userId === receipt.hostId)?.displayName ?? 'the host'
  const me = people.find((p) => p.userId === userId)
  const mine = userId ? shareOf(userId) : undefined
  const roulette = rouletteQuery.records[0]?.data ?? null
  const totalOf = (id: string) => shareOf(id)?.totalCents ?? 0
  // What each person actually owes the host, after card roulette (if it ran).
  const owedBy = (id: string) => amountOwed(id, receipt.hostId, totalOf, roulette)
  const owed = isHost ? (mine?.totalCents ?? 0) : userId ? owedBy(userId) : 0
  const billTotal = shares.reduce((s, x) => s + x.totalCents, 0)
  const links = payLinks(receipt, owed, `${receipt.merchant} (SplitSnap)`)
  const unpaid = people.filter((p) => p.userId !== receipt.hostId && !p.paid && owedBy(p.userId) > 0)
  const rouletteNote = (id: string): string | null => {
    if (!roulette || !roulette.entrantIds.includes(id)) return null
    if (roulette.loserId === id) return `Covers ${roulette.entrantIds.length} people (card roulette)`
    const loser = people.find((p) => p.userId === roulette.loserId)?.displayName ?? 'someone'
    return `Covered by ${roulette.loserId === userId ? 'you' : loser} (card roulette)`
  }

  // What friends see, for the host to check: the same links, built for an example amount.
  const previewLinks = payLinks(receipt, 100, '')
  const hasHandle = previewLinks.length > 0

  function saveHandle(patch: Partial<ReceiptRow>) {
    if (!receiptId || !receiptMutations.ready) return
    // Pay handles stay host-editable after lock (writableFields); amounts don't change.
    receiptMutations.put(receiptId, patch).catch(() => toast.error("Couldn't save that handle"))
  }

  function togglePaid() {
    if (!me || !participantMutations.ready) return
    participantMutations.put(me.recordId, { paid: me.paid ? 0 : 1 }).catch(() => toast.error("Couldn't save that"))
  }

  /** Guests can't tap "I paid", so the host records it (host-only action). */
  async function toggleGuestPaid(guestRecordId: string, paid: boolean) {
    setGuestBusy(guestRecordId)
    try {
      await callAction('setGuestPaid', { billId, guestId: guestRecordId, paid })
    } catch (err) {
      toast.error("Couldn't save that", err instanceof Error ? err.message : undefined)
    } finally {
      setGuestBusy(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3.5 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2">
      <header className="flex items-center gap-2">
        <Link to="/home" aria-label="Back to your bills" className="-ml-2.5 flex size-11 items-center justify-center rounded-full hover:bg-accent">
          <ChevronLeft className="size-[22px]" />
        </Link>
        <div className="flex flex-col">
          <h1 className="font-display text-xl font-semibold">{receipt.merchant}</h1>
          <span className="text-[13px] text-muted-foreground">
            Locked by {isHost ? 'you' : hostName} · totals are final
          </span>
        </div>
      </header>

      <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-5">
        {isHost ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-muted-foreground">You paid the restaurant · your share</span>
            <span className="font-display text-[44px] font-bold leading-tight tracking-tight tabular-nums">{formatCents(owed)}</span>
            <span className="text-sm text-muted-foreground">
              {unpaid.length === 0 ? 'Everyone has paid you back.' : `Waiting on ${unpaid.length} ${unpaid.length === 1 ? 'person' : 'people'} to pay you back.`}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-muted-foreground">You owe {hostName}</span>
            <span className="font-display text-[44px] font-bold leading-tight tracking-tight tabular-nums">{formatCents(owed)}</span>
          </div>
        )}

        {mine && (
          <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            <BreakdownRow label="Your items" cents={mine.subtotalCents} />
            {mine.feesCents !== 0 && <BreakdownRow label="Share of fees" cents={mine.feesCents} />}
            <BreakdownRow label="Share of tax" cents={mine.taxCents} />
            <BreakdownRow label="Share of tip" cents={mine.tipCents} />
            {mine.adjustmentCents !== 0 && <BreakdownRow label="Share of adjustment" cents={mine.adjustmentCents} />}
          </div>
        )}

        {!isHost && owed > 0 && (
          <>
            {links.length > 0 ? (
              <div className={cn('grid gap-2', links.length === 3 ? 'grid-cols-3' : links.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
                {links.map((l, i) => (
                  <a
                    key={l.app}
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      'flex h-[46px] items-center justify-center rounded-[10px] text-sm font-semibold',
                      i === 0 ? 'bg-primary text-primary-foreground' : 'border border-input bg-card',
                    )}
                  >
                    {l.app}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{hostName} hasn&apos;t added a payment handle. Pay them however you usually do.</p>
            )}
            {me && (
              <button
                type="button"
                onClick={togglePaid}
                disabled={!participantMutations.ready}
                aria-pressed={Boolean(me.paid)}
                className={cn(
                  'h-12 rounded-xl text-[15px] font-semibold transition-colors',
                  me.paid ? 'border border-success bg-success-soft text-success' : 'bg-foreground text-background',
                )}
              >
                {me.paid ? 'Marked as paid · undo' : `I paid ${hostName}`}
              </button>
            )}
          </>
        )}
        {!isHost && owed === 0 && (
          <p className="text-sm text-muted-foreground">
            {userId && rouletteNote(userId) ? `${rouletteNote(userId)} — you owe nothing.` : 'You don’t owe anything on this bill.'}
          </p>
        )}
        {!isHost && owed > 0 && userId && roulette?.loserId === userId && (
          <p className="text-sm font-medium text-primary">Card roulette: you’re covering everyone who was in.</p>
        )}
      </section>

      <RouletteCard billId={billId} hostId={receipt.hostId} people={people} shareOf={totalOf} result={roulette} />

      {isHost && (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">How friends pay you</h2>
              <p className="text-[13px] text-muted-foreground">
                {hasHandle ? 'Friends see these buttons with their amount filled in.' : 'Add one so friends get a pay button.'}
              </p>
            </div>
            {hasHandle && (
              <button
                type="button"
                onClick={() => setEditingHandles((e) => !e)}
                className="h-9 shrink-0 rounded-full border border-input px-3 text-[13px] font-semibold hover:bg-accent"
              >
                {editingHandles ? 'Done' : 'Edit'}
              </button>
            )}
          </div>
          {hasHandle && !editingHandles && (
            <div
              aria-label="Preview of friends' pay buttons"
              className={cn('grid gap-2', previewLinks.length === 3 ? 'grid-cols-3' : previewLinks.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}
            >
              {previewLinks.map((l, i) => (
                <span
                  key={l.app}
                  className={cn(
                    'flex h-[46px] items-center justify-center rounded-[10px] text-sm font-semibold opacity-70',
                    i === 0 ? 'bg-primary text-primary-foreground' : 'border border-input bg-card',
                  )}
                >
                  {l.app}
                </span>
              ))}
            </div>
          )}
          {(!hasHandle || editingHandles) && (
            <div className="flex flex-col gap-3">
              <HandleField label="Venmo" prefix="@" placeholder="your-venmo" value={receipt.payVenmo ?? ''} onSave={(payVenmo) => saveHandle({ payVenmo })} />
              <HandleField label="Cash App" prefix="$" placeholder="cashtag" value={receipt.payCashApp ?? ''} onSave={(payCashApp) => saveHandle({ payCashApp })} />
              <HandleField label="PayPal" prefix="paypal.me/" placeholder="name" value={receipt.payPaypal ?? ''} onSave={(payPaypal) => saveHandle({ payPaypal })} />
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">The table</h2>
        <ul className="flex flex-col rounded-xl border border-border bg-card px-3.5">
          {people.map((p) => {
            const host = p.userId === receipt.hostId
            const total = host ? totalOf(p.userId) : owedBy(p.userId)
            const note = rouletteNote(p.userId)
            const status = host
              ? 'Host · paid the restaurant'
              : total === 0
                ? note ?? 'Nothing to pay'
                : p.paid
                  ? 'Paid'
                  : note ? `${note} · not paid yet` : 'Not paid yet'
            return (
              <li key={p.userId} className="flex items-center gap-2.5 border-b border-muted py-3 last:border-b-0">
                <Avatar id={p.userId} name={p.displayName} size={30} />
                <span className="flex flex-1 flex-col">
                  <span className="font-medium">
                    {p.displayName}
                    {p.userId === userId && <span className="font-normal text-muted-foreground"> (you)</span>}
                    {p.isGuest && <span className="font-normal text-muted-foreground"> · guest</span>}
                  </span>
                  <span className={cn('text-[12.5px]', status === 'Paid' ? 'text-success' : status === 'Not paid yet' ? 'text-warning' : 'text-muted-foreground')}>
                    {status}
                  </span>
                </span>
                {isHost && p.isGuest && total > 0 && (
                  <button
                    type="button"
                    disabled={guestBusy !== null}
                    onClick={() => toggleGuestPaid(p.recordId, !p.paid)}
                    className="h-9 rounded-full border border-input px-3 text-[12.5px] font-semibold hover:bg-accent disabled:opacity-50"
                  >
                    {p.paid ? 'Undo' : 'Mark paid'}
                  </button>
                )}
                <span className="font-mono text-sm tabular-nums">{formatCents(total)}</span>
              </li>
            )
          })}
        </ul>
        <p className="text-center text-[12.5px] text-muted-foreground">Shares add up to the bill total, {formatCents(billTotal)}.</p>
      </section>
    </div>
  )
}

function BreakdownRow({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="font-mono tabular-nums">{formatCents(cents)}</span>
    </div>
  )
}
