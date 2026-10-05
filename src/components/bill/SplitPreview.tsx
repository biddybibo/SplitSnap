/**
 * "Preview the final split": what everyone would owe if the host locked now
 * (computeShares, the same function lockBill uses), and what's still unclaimed.
 */

import { Link } from 'react-router-dom'
import { useAuth, useQuery } from 'deepspace'
import { ChevronLeft } from 'lucide-react'
import { billMath } from '@/lib/billMath'
import { formatCents } from '@/lib/money'
import { Avatar } from './Table'
import { useTable } from './useTable'
import type { Item, ReceiptRow } from './types'

export function SplitPreview({ billId }: { billId: string }) {
  const { userId } = useAuth()
  const receipt = useQuery<ReceiptRow>('receipt').records[0]?.data
  const items = useQuery<Item>('items', { orderBy: 'createdAt', orderDir: 'asc' }).records
  const table = useTable()
  const claims = table.claims.map((c) => c.data)
  const people = table.people
  if (!receipt) return <p className="px-5 py-10 text-center text-muted-foreground">Loading…</p>

  const { check, claimable: lines, byLine, shares } = billMath(items, receipt, claims)
  const unclaimed = lines.filter((l) => byLine.get(l.id)!.claimantIds.length === 0)
  const extrasCents = check.grandTotalCents - check.claimableCents
  const shareOf = (id: string) => shares.find((s) => s.userId === id)
  const assignedCents = shares.reduce((s, x) => s + x.totalCents, 0)

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
                {p.isGuest && <span className="font-normal text-muted-foreground"> · guest</span>}
              </span>
              <span className="text-[12.5px] text-muted-foreground">
                {p.userId === receipt.hostId ? 'Host · paid the restaurant · ' : ''}
                {formatCents(shareOf(p.userId)?.subtotalCents ?? 0)} items + {formatCents((shareOf(p.userId)?.totalCents ?? 0) - (shareOf(p.userId)?.subtotalCents ?? 0))} extras
              </span>
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums">{formatCents(shareOf(p.userId)?.totalCents ?? 0)}</span>
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
          Fees, tax and tip are split in proportion to what each person ordered.{' '}
          {assignedCents === check.grandTotalCents
            ? 'Everyone’s shares add up to the bill total.'
            : `${formatCents(check.grandTotalCents - assignedCents)} isn’t assigned yet: claim the items below.`}
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
