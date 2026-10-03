/**
 * The host's summary above their own items (design: Host.dc.html): progress
 * toward lockable and who has picked what. Unclaimed items are marked "Nobody
 * yet" on their cards; the host assigns them from each item's split sheet.
 */

import type { LineClaims } from '@/lib/claims'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import { Avatar, type Participant } from './Table'

interface Props {
  meId: string | null
  lines: { id: string; priceCents: number }[]
  byLine: Map<string, LineClaims>
  people: Participant[]
  hereIds: Set<string>
  claimCounts: Map<string, number>
}

export function HostPanel({ meId, lines, byLine, people, hereIds, claimCounts }: Props) {
  const claimedCount = lines.filter((l) => (byLine.get(l.id)?.claimantIds.length ?? 0) > 0).length
  const unclaimedCents = lines
    .filter((l) => (byLine.get(l.id)?.claimantIds.length ?? 0) === 0)
    .reduce((s, l) => s + l.priceCents, 0)
  const pct = lines.length === 0 ? 0 : Math.round((claimedCount / lines.length) * 100)
  const done = lines.length > 0 && claimedCount === lines.length

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
        {!done && (
          <p className="text-[12.5px] text-muted-foreground">
            Know who had an unclaimed item? Tap its split button to assign it.
          </p>
        )}
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
