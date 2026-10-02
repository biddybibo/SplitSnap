/**
 * Claim screen: everyone at the table taps what they had. Shared lines show
 * every claimant and split evenly; "Your share so far" sums your portions.
 *
 * Claims are written straight to the bill room. The room stamps the caller's id
 * on each claim (userBound + immutable) and allows one per person per item
 * (uniqueOn), so the UI can't claim for anyone else even if it tried.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, useMutations, usePresenceRoom, useQuery } from 'deepspace'
import { Pencil } from 'lucide-react'
import { buttonVariants, useToast } from '@/components/ui'
import { claimsByLine, itemsTotalFor, unclaimedCount, type ClaimRow } from '@/lib/claims'
import { formatCents } from '@/lib/money'
import { shareBillLink } from '@/lib/share'
import { cn } from '@/lib/utils'
import { Avatar, AvatarStack, JoinCard, type Participant } from './Table'
import type { Item, ReceiptRow } from './types'

export function ClaimScreen({ billId }: { billId: string }) {
  const { userId } = useAuth()
  const receiptQuery = useQuery<ReceiptRow>('receipt')
  const itemsQuery = useQuery<Item>('items', { orderBy: 'createdAt', orderDir: 'asc' })
  const claimsQuery = useQuery<ClaimRow>('claims')
  const participantsQuery = useQuery<Participant>('participants', { orderBy: 'createdAt', orderDir: 'asc' })
  const claimMutations = useMutations<{ itemId: string }>('claims')
  const { peers } = usePresenceRoom(`bill:${billId}`)
  const toast = useToast()
  const [pending, setPending] = useState<Set<string>>(new Set())

  const receipt = receiptQuery.records[0]?.data
  if (!receipt || itemsQuery.status === 'loading' || claimsQuery.status === 'loading') {
    return <p className="px-5 py-10 text-center text-muted-foreground">Loading the bill…</p>
  }

  const people = participantsQuery.records.map((p) => p.data)
  const nameOf = (id: string) => people.find((p) => p.userId === id)?.displayName ?? 'Someone'
  const me = people.find((p) => p.userId === userId)
  const isHost = receipt.hostId === userId
  const hostName = people.find((p) => p.userId === receipt.hostId)?.displayName ?? 'the host'
  const canClaim = Boolean(me) && claimMutations.ready

  const lines = itemsQuery.records
    .filter((i) => i.data.kind === 'item' || i.data.kind === 'discount')
    .map((i) => ({ id: i.recordId, priceCents: i.data.priceCents, name: i.data.name, qty: i.data.qty }))
  const claims = claimsQuery.records
  const byLine = claimsByLine(lines, claims.map((c) => c.data))
  const myItemsCents = userId ? itemsTotalFor(userId, lines, byLine) : 0
  const unclaimed = unclaimedCount(lines, byLine)

  // Presence: who has the bill open right now, and who's here but hasn't tapped anything.
  const hereIds = new Set([...(userId ? [userId] : []), ...peers.map((p) => p.userId)])
  const hereCount = people.filter((p) => hereIds.has(p.userId)).length
  const stillPicking = people.filter(
    (p) => hereIds.has(p.userId) && !claims.some((c) => c.data.userId === p.userId),
  )

  async function toggle(lineId: string) {
    if (!canClaim || pending.has(lineId)) return
    setPending((s) => new Set(s).add(lineId))
    try {
      const mine = claims.find((c) => c.data.itemId === lineId && c.data.userId === userId)
      if (mine) await claimMutations.removeConfirmed(mine.recordId)
      else await claimMutations.createConfirmed({ itemId: lineId })
    } catch {
      toast.error("Couldn't save that tap", 'Check your connection and try again.')
    } finally {
      setPending((s) => {
        const next = new Set(s)
        next.delete(lineId)
        return next
      })
    }
  }

  async function invite() {
    try {
      if ((await shareBillLink(billId, receipt!.merchant)) === 'copied') {
        toast.success('Link copied', 'Paste it in your group chat.')
      }
    } catch (err) {
      toast.error("Couldn't share the link", err instanceof Error ? err.message : undefined)
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
      <header className="flex flex-col gap-2.5 px-5 pb-3 pt-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="truncate font-display text-xl font-semibold">{receipt.merchant}</h1>
            <p className="text-[13px] text-muted-foreground">
              {isHost ? 'You’re hosting' : `Hosted by ${hostName}`} · tap what you had
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {isHost && (
              <Link
                to={`/b/${billId}?edit=1`}
                aria-label="Edit the receipt"
                className="flex h-10 items-center gap-1.5 rounded-full border border-input bg-card px-3.5 text-[13px] font-semibold hover:bg-accent"
              >
                <Pencil className="size-3.5" /> Edit
              </Link>
            )}
            <button
              type="button"
              onClick={invite}
              className="h-10 rounded-full border border-input bg-card px-3.5 text-[13px] font-semibold hover:bg-accent"
            >
              Invite
            </button>
          </div>
        </div>
        {people.length > 0 && (
          <div className="flex items-center gap-2">
            <AvatarStack people={people} />
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-success">
              <span className="size-2 rounded-full bg-success" aria-hidden />
              {hereCount} here
              {stillPicking.length > 0 &&
                ` · ${stillPicking.length === 1 ? `${stillPicking[0].userId === userId ? 'You' : stillPicking[0].displayName} still picking` : `${stillPicking.length} still picking`}`}
            </span>
          </div>
        )}
      </header>

      {!me && participantsQuery.status === 'ready' && (
        <div className="px-5 pb-3">
          <JoinCard billId={billId} hostName={hostName} />
        </div>
      )}

      <ul className="flex flex-1 flex-col gap-2 px-5 pb-4">
        {lines.map((line) => {
          const c = byLine.get(line.id)!
          const mine = Boolean(userId && c.claimantIds.includes(userId))
          // Me first, then everyone else in the order they tapped.
          const claimants = mine ? [userId!, ...c.claimantIds.filter((id) => id !== userId)] : c.claimantIds
          return (
            <li key={line.id}>
              <button
                type="button"
                onClick={() => toggle(line.id)}
                disabled={!canClaim}
                aria-pressed={mine}
                aria-busy={pending.has(line.id) || undefined}
                className={cn(
                  'flex min-h-[60px] w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors disabled:cursor-default',
                  mine ? 'border-2 border-primary bg-primary-soft' : 'border border-border bg-card',
                  pending.has(line.id) && 'opacity-60',
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-medium">
                    {line.qty > 1 && <span className="text-muted-foreground">{line.qty}× </span>}
                    {line.name}
                  </span>
                  <span className="flex min-h-[22px] items-center gap-1.5">
                    {claimants.map((id) => (
                      <Avatar key={id} id={id} name={nameOf(id)} size={22} />
                    ))}
                    <span className={cn('text-[12.5px]', claimants.length === 0 ? 'text-warning' : 'text-muted-foreground')}>
                      {claimants.length === 0 ? 'Nobody yet' : claimants.length > 1 ? `Split ${claimants.length} ways` : ''}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="font-mono text-sm tabular-nums">{formatCents(line.priceCents)}</span>
                  {mine && c.portionCents !== null && (
                    <span className="font-mono text-xs text-primary tabular-nums">you {formatCents(c.portionCents)}</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <footer className="mt-2 flex flex-col gap-2.5 border-t border-border bg-card px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] text-muted-foreground">Your share so far</span>
            <span className="text-[12.5px] text-muted-foreground">
              {formatCents(myItemsCents)} items · tax, fees &amp; tip added at lock
            </span>
          </span>
          <span className="font-display text-[28px] font-bold tabular-nums">{formatCents(myItemsCents)}</span>
        </div>
        {unclaimed > 0 && (
          <p className="rounded-lg bg-warning-soft px-2.5 py-2 text-[13px] text-warning">
            {unclaimed === 1 ? '1 item still unclaimed' : `${unclaimed} items still unclaimed`}, so the host can&apos;t
            lock the bill yet.
          </p>
        )}
        <Link
          to={`/b/${billId}?view=split`}
          className={cn(buttonVariants({ size: 'lg' }), 'h-12 bg-foreground text-base text-background hover:bg-foreground/90')}
        >
          Preview the final split
        </Link>
      </footer>
    </div>
  )
}
