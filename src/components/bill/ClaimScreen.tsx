/**
 * Claim screen: everyone at the table taps what they had. Shared lines show
 * every claimant; the split button opens "split evenly / by how many". The host
 * also gets the host panel (progress, people, "Who had it?") and the lock.
 *
 * Claims are written straight to the bill room. The room stamps the caller's id
 * on each claim (userBound + immutable) and allows one per person per item
 * (uniqueOn), so the UI can't claim for anyone else even if it tried.
 */

import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth, useMutations, usePresenceRoom, useQuery } from 'deepspace'
import { Pencil, SplitSquareHorizontal } from 'lucide-react'
import { Button, ConfirmModal, buttonVariants, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import { claimsByLine, unclaimedCount } from '@/lib/claims'
import { computeShares } from '@/lib/computeShares'
import { formatCents } from '@/lib/money'
import { reconcile } from '@/lib/reconcile'
import { cn } from '@/lib/utils'
import { HostPanel } from './HostPanel'
import { InviteSheet } from './InviteSheet'
import { SplitSheet } from './SplitSheet'
import { Avatar, AvatarStack, JoinCard } from './Table'
import { useTable } from './useTable'
import type { Item, ReceiptRow } from './types'

export function ClaimScreen({ billId }: { billId: string }) {
  const { userId } = useAuth()
  const receiptQuery = useQuery<ReceiptRow>('receipt')
  const itemsQuery = useQuery<Item>('items', { orderBy: 'createdAt', orderDir: 'asc' })
  const table = useTable()
  const claimMutations = useMutations<{ itemId: string; units?: number | null }>('claims')
  const { peers } = usePresenceRoom(`bill:${billId}`)
  const toast = useToast()
  const [pending, setPending] = useState<Set<string>>(new Set())
  // `?invite=1` (the host's first share from the review screen) opens the sheet on arrival.
  const [params, setParams] = useSearchParams()
  const [inviteOpen, setInviteOpen] = useState(params.get('invite') === '1')
  const [confirmLock, setConfirmLock] = useState(false)
  const [locking, setLocking] = useState(false)
  const [splitLineId, setSplitLineId] = useState<string | null>(null)
  // The host's first share can land here *before* `?invite=1` is added (the live "you're seated" update
  // beats the action's reply), so react to the param arriving, not just to how the screen first mounted.
  const inviteParam = params.get('invite') === '1'
  useEffect(() => {
    if (inviteParam) setInviteOpen(true)
  }, [inviteParam])
  const closeInvite = useCallback(() => {
    setInviteOpen(false)
    if (params.has('invite')) setParams({}, { replace: true })
  }, [params, setParams])

  const receipt = receiptQuery.records[0]?.data
  if (!receipt || itemsQuery.status === 'loading' || table.loading) {
    return <p className="px-5 py-10 text-center text-muted-foreground">Loading the bill…</p>
  }

  const people = table.people
  const nameOf = (id: string) => people.find((p) => p.userId === id)?.displayName ?? 'Someone'
  const me = people.find((p) => p.userId === userId)
  const isHost = receipt.hostId === userId
  const hostName = people.find((p) => p.userId === receipt.hostId)?.displayName ?? 'the host'
  const canClaim = Boolean(me) && claimMutations.ready

  const lines = itemsQuery.records
    .filter((i) => i.data.kind === 'item' || i.data.kind === 'discount')
    .map((i) => ({ id: i.recordId, priceCents: i.data.priceCents, name: i.data.name, qty: Math.max(1, i.data.qty ?? 1) }))
  const claims = table.claims
  const byLine = claimsByLine(lines, claims.map((c) => c.data))
  const shares = computeShares(
    itemsQuery.records.map((i) => ({ id: i.recordId, kind: i.data.kind, priceCents: i.data.priceCents })),
    claims.map((c) => ({ itemId: c.data.itemId, userId: c.data.userId, units: c.data.units ?? null })),
    receipt.hostId,
  )
  const myShare = shares.find((s) => s.userId === userId)
  const breakdown = [
    `${formatCents(myShare?.subtotalCents ?? 0)} items`,
    ...(myShare?.feesCents ? [`${formatCents(myShare.feesCents)} fees`] : []),
    `${formatCents(myShare?.taxCents ?? 0)} tax`,
    `${formatCents(myShare?.tipCents ?? 0)} tip`,
    ...(myShare?.adjustmentCents ? [`${formatCents(myShare.adjustmentCents)} adj.`] : []),
  ].join(' + ')
  const unclaimed = unclaimedCount(lines, byLine)
  const billCheck = reconcile(
    itemsQuery.records.map((i) => ({ kind: i.data.kind, priceCents: i.data.priceCents })),
    {
      printedSubtotalCents: receipt.printedSubtotalCents ?? null,
      printedTotalCents: receipt.printedTotalCents,
      printedTipCents: receipt.printedTipCents ?? 0,
      chargedCents: receipt.chargedCents ?? null,
    },
  )
  const billTotalCents = billCheck.grandTotalCents
  // "By how many" lines that don't have every unit assigned yet block the lock (lockBill checks the same).
  const partlySplit = lines.filter((l) => {
    const c = byLine.get(l.id)!
    return c.byUnits && c.unitsAssigned !== l.qty
  })
  const canLock = isHost && unclaimed === 0 && partlySplit.length === 0 && billCheck.reconciled && lines.length > 0
  const lockHint = !billCheck.reconciled
    ? 'The receipt doesn’t add up yet. Tap Edit to fix it.'
    : unclaimed > 0
      ? null // the unclaimed warning above already says why
      : partlySplit.length > 0
        ? `${partlySplit[0].name}: ${byLine.get(partlySplit[0].id)!.unitsAssigned} of ${partlySplit[0].qty} assigned.`
        : 'Locking makes totals final. Picks can’t change after this.'
  const claimCounts = new Map<string, number>()
  for (const c of claims) claimCounts.set(c.data.userId, (claimCounts.get(c.data.userId) ?? 0) + 1)

  async function lock() {
    setLocking(true)
    try {
      await callAction('lockBill', { billId })
      // The bill page switches everyone to the settle screen when lockedAt lands.
    } catch (err) {
      toast.error("Couldn't lock the bill", err instanceof Error ? err.message : undefined)
    } finally {
      setLocking(false)
      setConfirmLock(false)
    }
  }

  // Presence: who has the bill open right now, and who's here but hasn't tapped anything.
  const hereIds = new Set([...(userId ? [userId] : []), ...peers.map((p) => p.userId)])
  const hereCount = people.filter((p) => hereIds.has(p.userId)).length
  const stillPicking = people.filter(
    (p) => hereIds.has(p.userId) && !claims.some((c) => c.data.userId === p.userId),
  )

  async function toggle(lineId: string) {
    if (!canClaim || pending.has(lineId)) return
    // A line split by count needs a count, not a plain tap, or it would fall back to an even split.
    if (byLine.get(lineId)?.byUnits) {
      setSplitLineId(lineId)
      return
    }
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


  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
      <header className="flex flex-col gap-2.5 px-5 pb-3 pt-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-2">
              <h1 className="truncate font-display text-xl font-semibold">{receipt.merchant}</h1>
              {isHost && (
                <span className="rounded-full bg-[#F1E6F8] px-2 py-0.5 text-[11.5px] font-semibold text-[#6B2E91]">Host</span>
              )}
            </span>
            <p className="text-[13px] text-muted-foreground">
              {isHost
                ? `You paid ${formatCents(billTotalCents)} · lock when everyone’s done`
                : `Hosted by ${hostName} · tap what you had`}
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
              onClick={() => setInviteOpen(true)}
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

      {isHost && (
        <HostPanel
          meId={userId}
          lines={lines}
          byLine={byLine}
          people={people}
          hereIds={hereIds}
          claimCounts={claimCounts}
        />
      )}
      {isHost && <h2 className="px-5 pb-2 text-[13px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">What you had</h2>}

      {!me && table.participantsReady && (
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
            <li key={line.id} className="flex items-stretch gap-1.5">
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
                    <span className={cn('text-[12.5px]', claimants.length === 0 || (c.byUnits && c.unitsAssigned !== line.qty) ? 'text-warning' : 'text-muted-foreground')}>
                      {claimants.length === 0
                        ? 'Nobody yet'
                        : c.byUnits
                          ? `${c.unitsAssigned} of ${line.qty} assigned`
                          : claimants.length > 1
                            ? `Split ${claimants.length} ways`
                            : ''}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="font-mono text-sm tabular-nums">{formatCents(line.priceCents)}</span>
                  {mine && c.portions.has(userId!) && (
                    <span className="font-mono text-xs text-primary tabular-nums">you {formatCents(c.portions.get(userId!)!)}</span>
                  )}
                </span>
              </button>
              {(me || isHost) && (
                <button
                  type="button"
                  onClick={() => setSplitLineId(line.id)}
                  aria-label={`Split ${line.name}`}
                  className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-accent"
                >
                  <SplitSquareHorizontal className="size-[18px]" />
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <footer className="mt-2 flex flex-col gap-2.5 border-t border-border bg-card px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] text-muted-foreground">Your share so far</span>
            <span className="text-[12.5px] text-muted-foreground">{breakdown}</span>
          </span>
          <span className="font-display text-[28px] font-bold tabular-nums">{formatCents(myShare?.totalCents ?? 0)}</span>
        </div>
        {unclaimed > 0 && (
          <p className="rounded-lg bg-warning-soft px-2.5 py-2 text-[13px] text-warning">
            {unclaimed === 1 ? '1 item still unclaimed' : `${unclaimed} items still unclaimed`}, so the host can&apos;t
            lock the bill yet.
          </p>
        )}
        {isHost && (
          <>
            <Button size="lg" className="h-12 text-base" disabled={!canLock || locking} onClick={() => setConfirmLock(true)}>
              {locking ? 'Locking…' : 'Lock bill and send totals'}
            </Button>
            {lockHint && <p className="-mt-1 text-center text-[12.5px] text-muted-foreground">{lockHint}</p>}
          </>
        )}
        <Link
          to={`/b/${billId}?view=split`}
          className={cn(
            buttonVariants({ size: 'lg', variant: isHost ? 'outline' : 'default' }),
            'h-12 text-base',
            !isHost && 'bg-foreground text-background hover:bg-foreground/90',
          )}
        >
          Preview the final split
        </Link>
      </footer>

      <ConfirmModal
        open={confirmLock}
        onClose={() => setConfirmLock(false)}
        onConfirm={lock}
        loading={locking}
        variant="default"
        title="Lock the bill?"
        description={`Totals become final and everyone sees what they owe you. You can't edit prices or claims after this. Bill total: ${formatCents(billTotalCents)}.`}
        confirmText="Lock and send totals"
      />

      {splitLineId && userId && lines.some((l) => l.id === splitLineId) && (
        <SplitSheet
          billId={billId}
          line={lines.find((l) => l.id === splitLineId)!}
          claims={claims}
          people={people}
          meId={userId}
          isHost={isHost}
          onClose={() => setSplitLineId(null)}
        />
      )}

      {inviteOpen && (
        <InviteSheet
          billId={billId}
          merchant={receipt.merchant}
          totalCents={billTotalCents}
          hostName={hostName === 'the host' ? 'A friend' : hostName}
          hostId={receipt.hostId}
          people={people}
          hereIds={hereIds}
          isHost={isHost}
          onClose={closeInvite}
        />
      )}
    </div>
  )
}
