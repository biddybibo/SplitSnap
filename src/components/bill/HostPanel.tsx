/**
 * The host's control panel above the items (design: Host.dc.html): progress
 * toward lockable, who's picked what, and "Who had it?" for anything nobody
 * claimed. Assigning goes through the host-only `assignItem` action.
 */

import { useState } from 'react'
import { useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import type { LineClaims } from '@/lib/claims'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import { Avatar, type Participant } from './Table'

interface Line {
  id: string
  name: string
  priceCents: number
  qty: number
}

interface Props {
  /** 'summary' = progress + people (above the host's own items); 'unclaimed' = "Who had it?" (below them). */
  section: 'summary' | 'unclaimed'
  billId: string
  meId: string | null
  lines: Line[]
  byLine: Map<string, LineClaims>
  people: Participant[]
  hereIds: Set<string>
  claimCounts: Map<string, number>
}

interface Undo {
  itemId: string
  name: string
  note: string
  previous: { userId: string; units?: number }[]
}

export function HostPanel({ section, billId, meId, lines, byLine, people, hereIds, claimCounts }: Props) {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [undo, setUndo] = useState<Undo | null>(null)

  const claimedCount = lines.filter((l) => (byLine.get(l.id)?.claimantIds.length ?? 0) > 0).length
  const unclaimed = lines.filter((l) => (byLine.get(l.id)?.claimantIds.length ?? 0) === 0)
  const unclaimedCents = unclaimed.reduce((s, l) => s + l.priceCents, 0)
  const pct = lines.length === 0 ? 0 : Math.round((claimedCount / lines.length) * 100)
  const done = lines.length > 0 && unclaimed.length === 0

  async function assign(line: Line, userIds: string[], note: string) {
    setBusy(line.id)
    const c = byLine.get(line.id)
    const previous = (c?.claimantIds ?? []).map((userId) => ({ userId }))
    try {
      await callAction('assignItem', { billId, itemId: line.id, assignments: userIds.map((userId) => ({ userId })) })
      setUndo({ itemId: line.id, name: line.name, note, previous })
    } catch (err) {
      toast.error("Couldn't assign that", err instanceof Error ? err.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  async function undoLast() {
    if (!undo) return
    setBusy(undo.itemId)
    try {
      await callAction('assignItem', { billId, itemId: undo.itemId, assignments: undo.previous })
      setUndo(null)
    } catch (err) {
      toast.error("Couldn't undo", err instanceof Error ? err.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  if (section === 'unclaimed') {
    if (unclaimed.length === 0 && !undo) return null
    return (
      <div className="flex flex-col gap-3.5 px-5 pb-4">
        {unclaimed.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.6px] text-warning">Nobody claimed</h2>
            {unclaimed.map((line) => (
              <div key={line.id} className="flex flex-col gap-2.5 rounded-xl border-2 border-[#F2C9A3] bg-card px-3.5 py-3">
                <div className="flex justify-between">
                  <span className="font-medium">{line.name}</span>
                  <span className="font-mono tabular-nums">{formatCents(line.priceCents)}</span>
                </div>
                <span className="text-[13px] text-muted-foreground">Who had it?</span>
                <div className="flex flex-wrap gap-2">
                  {people.map((p) => (
                    <button
                      key={p.userId}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => assign(line, [p.userId], `${line.name} assigned to ${p.userId === meId ? 'you' : p.displayName}`)}
                      className="h-10 rounded-full border border-input bg-card px-3 text-[13.5px] hover:bg-accent disabled:opacity-50"
                    >
                      {p.userId === meId ? 'Me' : p.displayName}
                    </button>
                  ))}
                  {people.length > 1 && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => assign(line, people.map((p) => p.userId), `${line.name} split with everyone`)}
                      className="h-10 rounded-full border border-primary bg-primary-soft px-3 text-[13.5px] font-semibold text-primary disabled:opacity-50"
                    >
                      Split with everyone
                    </button>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}
        {undo && (
          <div className="flex items-center justify-between rounded-xl border border-[#B7DCC8] bg-success-soft px-3.5 py-2.5">
            <span className="text-sm font-medium text-success">{undo.note}</span>
            <button type="button" disabled={busy !== null} onClick={undoLast} className="h-9 px-2.5 text-[13.5px] font-semibold text-success">
              Undo
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3.5 px-5 pb-3">
      <section className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-card p-3.5">
        <div className="flex items-baseline justify-between">
          <span className="font-display text-[17px] font-semibold">
            {done ? `All ${lines.length} items claimed` : `${claimedCount} of ${lines.length} items claimed`}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {done ? 'Ready to lock' : `${formatCents(unclaimedCents)} unclaimed`}
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Items claimed"
        >
          <div className={cn('h-2 rounded transition-[width]', done ? 'bg-success' : 'bg-primary')} style={{ width: `${pct}%` }} />
        </div>
      </section>

      {people.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">People</h2>
          <ul className="flex flex-col rounded-xl border border-border bg-card px-3.5">
            {people.map((p) => {
              const n = claimCounts.get(p.userId) ?? 0
              const here = hereIds.has(p.userId)
              return (
                <li key={p.userId} className="flex items-center gap-2.5 border-b border-muted py-2.5 last:border-b-0">
                  <Avatar id={p.userId} name={p.displayName} size={30} />
                  <span className="flex-1">
                    {p.displayName}
                    {p.userId === meId && <span className="text-muted-foreground"> (you)</span>}
                  </span>
                  {n > 0 ? (
                    <span className="text-[12.5px] font-semibold text-success">Picked {n}</span>
                  ) : here ? (
                    <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-primary">
                      <span className="size-[7px] rounded-full bg-primary" aria-hidden />
                      Still picking
                    </span>
                  ) : (
                    <span className="text-[12.5px] text-muted-foreground">Hasn&apos;t picked yet</span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

    </div>
  )
}
