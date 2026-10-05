/**
 * "Split one item" bottom sheet (design: Split.dc.html): split evenly, or by how
 * many ("2 of 3 tacos"). The host edits everyone (host-only `assignItem`);
 * anyone else edits only their own claim — other rows are shown read-only, so
 * no one can put someone else on an item.
 */

import { useEffect, useRef, useState } from 'react'
import { useMutations } from 'deepspace'
import { Check, Minus, Plus, X } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import type { ClaimRow } from '@/lib/claims'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import { Avatar, type Participant } from './Table'

interface Props {
  billId: string
  line: { id: string; name: string; priceCents: number; qty: number }
  claims: { recordId: string; data: ClaimRow }[]
  people: Participant[]
  meId: string
  isHost: boolean
  onClose: () => void
}

export function SplitSheet({ billId, line, claims, people, meId, isHost, onClose }: Props) {
  const onLine = claims.filter((c) => c.data.itemId === line.id)
  const startByUnits = onLine.length > 0 && onLine.every((c) => typeof c.data.units === 'number' && c.data.units > 0)
  const [mode, setMode] = useState<'even' | 'qty'>(startByUnits ? 'qty' : 'even')
  const [on, setOn] = useState<Set<string>>(new Set(onLine.map((c) => c.data.userId)))
  const [qty, setQty] = useState<Map<string, number>>(
    new Map(onLine.map((c) => [c.data.userId, typeof c.data.units === 'number' ? c.data.units : 0])),
  )
  const [saving, setSaving] = useState(false)
  const claimMutations = useMutations<{ itemId: string; units?: number | null }>('claims')
  const toast = useToast()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const editable = (id: string) => isHost || id === meId
  const onCount = people.filter((p) => on.has(p.userId)).length
  const qtySum = people.reduce((s, p) => s + (qty.get(p.userId) ?? 0), 0)
  const valid = mode === 'even' ? onCount > 0 : qtySum === line.qty
  // A non-host saves only their own row, so they can save a partial "by how many".
  const canSave = isHost ? valid : mode === 'even' || (qty.get(meId) ?? 0) > 0 || onLine.some((c) => c.data.userId === meId)

  function amountFor(id: string): number | null {
    if (mode === 'even') return on.has(id) && onCount > 0 ? Math.round(line.priceCents / onCount) : null
    const q = qty.get(id) ?? 0
    return q > 0 ? Math.round((line.priceCents * q) / line.qty) : null
  }

  async function save() {
    setSaving(true)
    try {
      if (isHost) {
        const assignments =
          mode === 'even'
            ? people.filter((p) => on.has(p.userId)).map((p) => ({ userId: p.userId }))
            : people.filter((p) => (qty.get(p.userId) ?? 0) > 0).map((p) => ({ userId: p.userId, units: qty.get(p.userId) }))
        await callAction('assignItem', { billId, itemId: line.id, assignments })
      } else {
        const mine = onLine.find((c) => c.data.userId === meId)
        const want = mode === 'even' ? on.has(meId) : (qty.get(meId) ?? 0) > 0
        const units = mode === 'qty' ? (qty.get(meId) ?? 0) : null
        if (!want && mine) await claimMutations.removeConfirmed(mine.recordId)
        else if (want && mine) await claimMutations.putConfirmed(mine.recordId, { units })
        else if (want) await claimMutations.createConfirmed({ itemId: line.id, units })
      }
      onClose()
    } catch (err) {
      toast.error("Couldn't save the split", err instanceof Error ? err.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  const status =
    mode === 'even'
      ? onCount > 0
        ? `Split ${onCount} ${onCount === 1 ? 'way' : 'ways'}`
        : 'Pick at least one person'
      : qtySum === line.qty
        ? `All ${line.qty} assigned`
        : `${qtySum} of ${line.qty} assigned`

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-foreground/55" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="split-title"
        className="relative mx-auto flex max-h-[92dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-[20px] bg-card px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2.5 animate-in"
      >
        <span className="h-1 w-10 self-center rounded-full bg-input" aria-hidden />
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-0.5">
            <h2 id="split-title" className="font-display text-[22px] font-semibold">
              {line.name}
            </h2>
            <p className="text-[13.5px] text-muted-foreground">
              {line.qty > 1 ? `${line.qty} × · ` : ''}
              <span className="font-mono">{formatCents(line.priceCents)}</span>
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
          {(['even', 'qty'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'h-10 rounded-[9px] text-sm font-semibold transition-colors',
                mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {m === 'even' ? 'Split evenly' : 'By how many'}
            </button>
          ))}
        </div>
        <p className="text-[13.5px] text-muted-foreground">
          {mode === 'even'
            ? 'Everyone ticked pays an equal part.'
            : `Set how many of the ${line.qty} each person had.`}
          {!isHost && ' You can change your own row; the host can change anyone’s.'}
        </p>

        <ul className="flex flex-col rounded-xl border border-border px-3.5">
          {people.map((p) => {
            const amount = amountFor(p.userId)
            const canEdit = editable(p.userId)
            const q = qty.get(p.userId) ?? 0
            return (
              <li key={p.userId} className="flex min-h-[60px] items-center gap-3 border-b border-muted last:border-b-0">
                <Avatar id={p.userId} name={p.displayName} size={32} />
                <span className="flex flex-1 flex-col">
                  <span>
                    {p.displayName}
                    {p.userId === meId && <span className="text-muted-foreground"> (you)</span>}
                    {p.isGuest && <span className="text-muted-foreground"> · guest</span>}
                  </span>
                  <span className={cn('font-mono text-[12.5px]', amount !== null ? 'text-primary' : 'text-muted-foreground')}>
                    {amount !== null ? formatCents(amount) : 'Not included'}
                  </span>
                </span>
                {mode === 'even' ? (
                  <button
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={on.has(p.userId)}
                    aria-label={`Include ${p.displayName}`}
                    onClick={() =>
                      setOn((s) => {
                        const n = new Set(s)
                        if (n.has(p.userId)) n.delete(p.userId)
                        else n.add(p.userId)
                        return n
                      })
                    }
                    className={cn(
                      'flex size-11 items-center justify-center rounded-xl border disabled:opacity-40',
                      on.has(p.userId) ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card',
                    )}
                  >
                    {on.has(p.userId) && <Check className="size-5" strokeWidth={3} />}
                  </button>
                ) : (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={!canEdit || q <= 0}
                      aria-label={`One less for ${p.displayName}`}
                      onClick={() => setQty((m) => new Map(m).set(p.userId, q - 1))}
                      className="flex size-10 items-center justify-center rounded-[10px] border border-input bg-card disabled:opacity-40"
                    >
                      <Minus className="size-4" />
                    </button>
                    <span className="w-7 text-center font-mono text-base">{q}</span>
                    <button
                      type="button"
                      disabled={!canEdit || (isHost ? qtySum >= line.qty : q >= line.qty)}
                      aria-label={`One more for ${p.displayName}`}
                      onClick={() => setQty((m) => new Map(m).set(p.userId, q + 1))}
                      className="flex size-10 items-center justify-center rounded-[10px] border border-input bg-card disabled:opacity-40"
                    >
                      <Plus className="size-4" />
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>

        <div className="flex items-center justify-between text-[13.5px]">
          <span className={cn('font-medium', valid ? 'text-success' : 'text-warning')}>{status}</span>
          {valid && <span className="font-mono text-muted-foreground">{formatCents(line.priceCents)} covered</span>}
        </div>
        <Button size="lg" className="h-[52px] text-base" disabled={!canSave || saving || !claimMutations.ready} onClick={save}>
          {saving ? 'Saving…' : isHost ? 'Save split' : 'Save my part'}
        </Button>
      </div>
    </div>
  )
}
