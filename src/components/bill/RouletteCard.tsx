/**
 * Card roulette on the settle screen: "I'm in" on your own phone, the host spins,
 * everyone watches the same reveal. The draw happens on the server (spinRoulette);
 * this only shows it. No stakes beyond the bill itself.
 */

import { useEffect, useRef, useState } from 'react'
import { useAuth, useMutations, useQuery } from 'deepspace'
import { Dices } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import { formatCents } from '@/lib/money'
import type { RouletteMode, RouletteResult } from '@/lib/roulette'
import { cn } from '@/lib/utils'
import { Avatar } from './Table'
import type { Seat } from './useTable'

interface Props {
  billId: string
  hostId: string
  people: Seat[]
  shareOf: (id: string) => number
  result: (RouletteResult & { drawnAt?: string }) | null
}

const REVEAL_MS = 2200

export function RouletteCard({ billId, hostId, people, shareOf, result }: Props) {
  const { userId } = useAuth()
  const entries = useQuery<{ userId: string }>('rouletteEntries')
  const entryMutations = useMutations<Record<string, never>>('rouletteEntries')
  const toast = useToast()
  const [mode, setMode] = useState<RouletteMode>('even')
  const [busy, setBusy] = useState(false)
  const isHost = userId === hostId

  // Eligible: signed-in people with something on the bill. Guests pay their own share.
  const eligible = people.filter((p) => !p.isGuest && shareOf(p.userId) > 0)
  const inIds = new Set(entries.records.map((e) => e.data.userId))
  const myEntry = entries.records.find((e) => e.data.userId === userId)
  const entrants = eligible.filter((p) => inIds.has(p.userId))
  const somebodyPaid = entrants.some((p) => p.paid)

  const reveal = useReveal(result, people)

  async function toggleIn() {
    if (!entryMutations.ready) return
    try {
      if (myEntry) await entryMutations.removeConfirmed(myEntry.recordId)
      else await entryMutations.createConfirmed({})
    } catch {
      toast.error("Couldn't save that")
    }
  }

  async function spin() {
    setBusy(true)
    try {
      await callAction('spinRoulette', { billId, mode })
    } catch (err) {
      toast.error("Couldn't spin", err instanceof Error ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  if (eligible.length < 2 && !result) return null

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft">
          <Dices className="size-5 text-primary" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 className="font-semibold">Card roulette</h2>
          <p className="text-[13px] text-muted-foreground">
            Everyone who&apos;s in puts their share in, and one person covers it all. Just for fun, just this bill.
          </p>
        </div>
      </div>

      {result ? (
        <RevealPanel reveal={reveal} result={result} people={people} shareOf={shareOf} meId={userId} hostId={hostId} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {entrants.length === 0 ? (
              <span className="text-[13px] text-muted-foreground">Nobody&apos;s in yet.</span>
            ) : (
              entrants.map((p) => (
                <span key={p.userId} className="flex items-center gap-1.5 rounded-full bg-muted py-1 pl-1 pr-2.5 text-[13px]">
                  <Avatar id={p.userId} name={p.displayName} size={22} />
                  {p.userId === userId ? 'You' : p.displayName}
                </span>
              ))
            )}
          </div>
          {eligible.some((p) => p.userId === userId) && (
            <Button
              variant={myEntry ? 'outline' : 'default'}
              className="h-11"
              disabled={!entryMutations.ready}
              onClick={toggleIn}
              aria-pressed={Boolean(myEntry)}
            >
              {myEntry ? 'I’m in · tap to leave' : 'I’m in'}
            </Button>
          )}
          {isHost && (
            <div className="flex flex-col gap-2 border-t border-muted pt-3">
              <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                {(['even', 'weighted'] as const).map((m) => (
                  <button
                    key={m}
                    role="tab"
                    type="button"
                    aria-selected={mode === m}
                    onClick={() => setMode(m)}
                    className={cn(
                      'h-9 rounded-[9px] text-[13px] font-semibold',
                      mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
                    )}
                  >
                    {m === 'even' ? 'Even odds' : 'Weighted by order'}
                  </button>
                ))}
              </div>
              <Button size="lg" className="h-12" disabled={busy || entrants.length < 2 || somebodyPaid} onClick={spin}>
                {busy ? 'Spinning…' : `Spin for ${entrants.length} ${entrants.length === 1 ? 'person' : 'people'}`}
              </Button>
              <p className="text-center text-[12.5px] text-muted-foreground">
                {somebodyPaid
                  ? 'Someone who’s in has already paid, so it’s too late to spin.'
                  : entrants.length < 2
                    ? 'At least two people need to be in.'
                    : 'One spin per bill. Everyone sees the result at once.'}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Cycles through the entrants' names, slowing down, then lands on the loser. Skipped for old results. */
function useReveal(result: (RouletteResult & { drawnAt?: string }) | null, people: Seat[]) {
  const [shownId, setShownId] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const startedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!result) return
    const key = `${result.loserId}:${result.drawnAt ?? ''}`
    if (startedFor.current === key) return
    startedFor.current = key
    const fresh = result.drawnAt ? Date.now() - new Date(result.drawnAt).getTime() < 15000 : false
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!fresh || reduced || result.entrantIds.length < 2) {
      setShownId(result.loserId)
      setDone(true)
      return
    }
    setDone(false)
    const ids = result.entrantIds
    const timers: ReturnType<typeof setTimeout>[] = []
    let t = 0
    let delay = 70
    let i = 0
    while (t + delay < REVEAL_MS) {
      const id = ids[i % ids.length]
      t += delay
      timers.push(setTimeout(() => setShownId(id), t))
      delay *= 1.12
      i++
    }
    timers.push(
      setTimeout(() => {
        setShownId(result.loserId)
        setDone(true)
      }, REVEAL_MS),
    )
    return () => timers.forEach(clearTimeout)
  }, [result, people])

  return { shownId, done }
}

function RevealPanel({
  reveal,
  result,
  people,
  shareOf,
  meId,
  hostId,
}: {
  reveal: { shownId: string | null; done: boolean }
  result: RouletteResult
  people: Seat[]
  shareOf: (id: string) => number
  meId: string | null
  hostId: string
}) {
  const nameOf = (id: string) => (id === meId ? 'You' : people.find((p) => p.userId === id)?.displayName ?? 'Someone')
  const pot = result.entrantIds.reduce((s, id) => s + shareOf(id), 0)
  const shown = reveal.shownId ?? result.entrantIds[0]
  const loserIsMe = result.loserId === meId
  return (
    <div className="flex flex-col items-center gap-2 py-2 text-center" aria-live="polite">
      <Avatar id={shown} name={nameOf(shown)} size={56} />
      <span className={cn('font-display text-2xl font-semibold transition-opacity', !reveal.done && 'opacity-70')}>
        {nameOf(shown)}
      </span>
      {reveal.done && (
        <p className="text-sm text-muted-foreground">
          {loserIsMe ? 'You cover' : `${nameOf(result.loserId)} covers`} {formatCents(pot)} for {result.entrantIds.length} people
          {result.mode === 'weighted' ? ' (weighted by order)' : ''}.
          {result.loserId === hostId ? ' Everyone who was in owes nothing.' : ''}
        </p>
      )}
    </div>
  )
}
