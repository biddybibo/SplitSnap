/**
 * "Preview the final split": everyone's item portions so far, and what's still
 * unclaimed. Tax, fees and tip are split by subtotal at lock (computeShares),
 * so this preview shows items only and says so.
 */

import { Link } from 'react-router-dom'
import { useAuth, useQuery } from 'deepspace'
import { ChevronLeft } from 'lucide-react'
import { claimsByLine, itemsTotalFor, type ClaimRow } from '@/lib/claims'
import { formatCents } from '@/lib/money'
import { reconcile } from '@/lib/reconcile'
import { Avatar, type Participant } from './Table'
import type { Item, ReceiptRow } from './types'

export function SplitPreview({ billId }: { billId: string }) {
  const { userId } = useAuth()
  const receipt = useQuery<ReceiptRow>('receipt').records[0]?.data
  const items = useQuery<Item>('items', { orderBy: 'createdAt', orderDir: 'asc' }).records
  const claims = useQuery<ClaimRow>('claims').records.map((c) => c.data)
  const people = useQuery<Participant>('participants', { orderBy: 'createdAt', orderDir: 'asc' }).records.map(
    (p) => p.data,
  )
  if (!receipt) return <p className="px-5 py-10 text-center text-muted-foreground">Loading…</p>

  const lines = items
    .filter((i) => i.data.kind === 'item' || i.data.kind === 'discount')
    .map((i) => ({ id: i.recordId, priceCents: i.data.priceCents, name: i.data.name }))
  const byLine = claimsByLine(lines, claims)
  const unclaimed = lines.filter((l) => byLine.get(l.id)!.claimantIds.length === 0)
  const check = reconcile(
    items.map((i) => ({ kind: i.data.kind, priceCents: i.data.priceCents })),
    {
      printedSubtotalCents: receipt.printedSubtotalCents ?? null,
      printedTotalCents: receipt.printedTotalCents,
      printedTipCents: receipt.printedTipCents ?? 0,
      chargedCents: receipt.chargedCents ?? null,
    },
  )
  const extrasCents = check.grandTotalCents - check.claimableCents

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3.5 px-5 pb-10 pt-2">
      <header className="flex items-center gap-2">
        <Link
          to={`/b/${billId}`}
          aria-label="Back to the items"
          className="-ml-2.5 flex size-11 items-center justify-center rounded-full hover:bg-accent"
        >
          <ChevronLeft className="size-[22px]" />
        </Link>
        <div className="flex flex-col">
          <h1 className="font-display text-xl font-semibold">{receipt.merchant}</h1>
          <span className="text-[13px] text-muted-foreground">Preview · not final until the host locks</span>
        </div>
      </header>

      <section className="flex flex-col rounded-xl border border-border bg-card px-3.5">
        {people.map((p) => (
          <div key={p.userId} className="flex items-center gap-2.5 border-b border-muted py-3 last:border-b-0">
            <Avatar id={p.userId} name={p.displayName} size={30} />
            <span className="flex flex-1 flex-col">
              <span className="font-medium">
                {p.displayName}
                {p.userId === userId && <span className="font-normal text-muted-foreground"> (you)</span>}
              </span>
              <span className="text-[12.5px] text-muted-foreground">
                {p.userId === receipt.hostId ? 'Host · paid the restaurant' : 'Items so far'}
              </span>
            </span>
            <span className="font-mono text-sm tabular-nums">{formatCents(itemsTotalFor(p.userId, lines, byLine))}</span>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-1.5 rounded-xl border border-border bg-card px-3.5 py-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Items</span>
          <span className="font-mono tabular-nums">{formatCents(check.claimableCents)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Fees, tax &amp; tip</span>
          <span className="font-mono tabular-nums">{formatCents(extrasCents)}</span>
        </div>
        <div className="flex justify-between border-t border-muted pt-1.5 font-semibold">
          <span>Bill total</span>
          <span className="font-mono tabular-nums">{formatCents(check.grandTotalCents)}</span>
        </div>
        <p className="pt-1 text-[12.5px] text-muted-foreground">
          Fees, tax and tip are split in proportion to what each person ordered when the host locks the bill.
        </p>
      </section>

      {unclaimed.length > 0 && (
        <section className="flex flex-col gap-1.5 rounded-xl bg-warning-soft px-3.5 py-3 text-sm text-warning">
          <span className="font-semibold">Still unclaimed</span>
          {unclaimed.map((l) => (
            <span key={l.id} className="flex justify-between">
              <span>{l.name}</span>
              <span className="font-mono tabular-nums">{formatCents(l.priceCents)}</span>
            </span>
          ))}
        </section>
      )}
    </div>
  )
}
