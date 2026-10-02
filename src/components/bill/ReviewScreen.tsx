/**
 * Review screen: the host checks what the AI read against the photo, fixes it
 * inline, and sets the tip. Everyone else sees the same bill read-only.
 *
 * Edits go straight to the bill room (`useMutations`); the room's permissions
 * (ownerField: hostId, writableFields) are what actually stop a non-host, and
 * new lines go through the host-only `addItem` action.
 */

import { useEffect, useState } from 'react'
import { useAsyncResource, useAuth, useMutations, useQuery, useR2Files } from 'deepspace'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import { formatCents, parseDollars } from '@/lib/money'
import { reconcile, tipForPercent, type LineKind } from '@/lib/reconcile'
import { cn } from '@/lib/utils'
import { MoneyField, TextField } from './fields'

interface Item {
  name: string
  qty: number
  priceCents: number
  kind: LineKind
  hostId: string
}

interface ReceiptRow {
  merchant: string
  printedSubtotalCents: number | null
  printedTotalCents: number
  printedTipCents?: number
  chargedCents?: number | null
  receiptNumber?: string
  printedAt?: string
  imageId?: string
  hostId: string
}

const TIP_PERCENTS = [15, 18, 20]

export function ReviewScreen({ billId }: { billId: string }) {
  const { userId } = useAuth()
  const receiptQuery = useQuery<ReceiptRow>('receipt')
  const itemsQuery = useQuery<Item>('items', { orderBy: 'createdAt', orderDir: 'asc' })
  const itemMutations = useMutations<Item>('items')
  const receiptMutations = useMutations<ReceiptRow>('receipt')
  const toast = useToast()
  const [adding, setAdding] = useState(false)

  if (receiptQuery.status === 'loading' || itemsQuery.status === 'loading') {
    return <p className="px-5 py-10 text-center text-muted-foreground">Loading the bill…</p>
  }
  if (receiptQuery.status === 'error' || itemsQuery.status === 'error') {
    return <p className="px-5 py-10 text-center text-muted-foreground">Couldn&apos;t load this bill. Check your connection.</p>
  }
  const receiptRecord = receiptQuery.records[0]
  if (!receiptRecord) {
    return <p className="px-5 py-10 text-center text-muted-foreground">This bill doesn&apos;t exist, or it&apos;s still being created.</p>
  }

  const receipt = receiptRecord.data
  const isHost = receipt.hostId === userId
  const canEdit = isHost && itemMutations.ready && receiptMutations.ready
  const items = itemsQuery.records
  const check = reconcile(
    items.map((i) => ({ kind: i.data.kind, priceCents: i.data.priceCents })),
    {
      printedSubtotalCents: receipt.printedSubtotalCents ?? null,
      printedTotalCents: receipt.printedTotalCents,
      printedTipCents: receipt.printedTipCents ?? 0,
      chargedCents: receipt.chargedCents ?? null,
    },
  )

  const claimable = items.filter((i) => i.data.kind === 'item' || i.data.kind === 'discount')
  const charges = items.filter((i) => ['fee', 'tax', 'adjustment'].includes(i.data.kind))
  const tipLines = items.filter((i) => i.data.kind === 'tip')

  async function addLine(kind: LineKind, name: string, priceCents: number) {
    setAdding(true)
    try {
      await callAction('addItem', { billId, kind, name, priceCents })
    } catch (err) {
      toast.error("Couldn't add the line", err instanceof Error ? err.message : undefined)
    } finally {
      setAdding(false)
    }
  }

  function updateItem(id: string, patch: Partial<Item>) {
    itemMutations.put(id, patch).catch(() => toast.error("Couldn't save that change"))
  }

  function removeItem(id: string) {
    itemMutations.remove(id).catch(() => toast.error("Couldn't delete that line"))
  }

  function updateReceipt(patch: Partial<ReceiptRow>) {
    receiptMutations.put(receiptRecord.recordId, patch).catch(() => toast.error("Couldn't save that change"))
  }

  /** One tip line holds the tip being paid; extra tip lines (rare) are folded into it. */
  async function setTip(cents: number) {
    const [first, ...rest] = tipLines
    rest.forEach((l) => removeItem(l.recordId))
    if (first) updateItem(first.recordId, { priceCents: cents })
    else if (cents !== 0) await addLine('tip', 'Tip', cents)
  }

  function setCharged(cents: number | null) {
    updateReceipt({ chargedCents: cents })
    if (cents === null) return
    const tip = cents - (receipt.printedTotalCents - (receipt.printedTipCents ?? 0))
    if (tip >= 0) void setTip(tip)
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 pb-16 pt-6">
      <header className="flex flex-col gap-1">
        {canEdit ? (
          <TextField
            label="Restaurant"
            value={receipt.merchant}
            onSave={(merchant) => updateReceipt({ merchant })}
            className="-mx-2 text-2xl font-semibold"
          />
        ) : (
          <h1 className="text-2xl font-semibold">{receipt.merchant}</h1>
        )}
        <ReceiptMeta printedAt={receipt.printedAt} receiptNumber={receipt.receiptNumber} />
        {!isHost && (
          <p className="mt-2 text-sm text-muted-foreground">
            The host is checking the receipt. You&apos;ll be able to tap what you had soon.
          </p>
        )}
      </header>

      {isHost && receipt.imageId && <ReceiptPhoto imageId={receipt.imageId} />}

      {check.offByCents !== 0 && (
        <MismatchBanner
          offByCents={check.offByCents}
          suspect={check.suspect}
          canEdit={canEdit}
          busy={adding}
          onAdjust={() => addLine('adjustment', 'Adjustment', check.offByCents)}
        />
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Items</h2>
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {claimable.map((i) => (
            <LineRow
              key={i.recordId}
              item={i.data}
              canEdit={canEdit}
              onName={(name) => updateItem(i.recordId, { name })}
              onPrice={(priceCents) =>
                updateItem(i.recordId, { priceCents, kind: priceCents < 0 ? 'discount' : 'item' })
              }
              onDelete={() => removeItem(i.recordId)}
            />
          ))}
          {claimable.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">No items yet.</li>}
        </ul>
        {canEdit && <AddLineForm busy={adding} onAdd={(name, cents) => addLine(cents < 0 ? 'discount' : 'item', name, cents)} />}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Fees and tax</h2>
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {charges.map((i) => (
            <LineRow
              key={i.recordId}
              item={i.data}
              canEdit={canEdit}
              onName={(name) => updateItem(i.recordId, { name })}
              onPrice={(priceCents) => updateItem(i.recordId, { priceCents })}
              onDelete={i.data.kind === 'tax' ? undefined : () => removeItem(i.recordId)}
            />
          ))}
          {charges.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">No fees or tax.</li>}
        </ul>
      </section>

      <section className="flex flex-col gap-1 rounded-xl border border-dashed border-border px-4 py-3">
        <h2 className="pb-1 text-sm font-medium text-muted-foreground">Printed on the receipt</h2>
        <SummaryRow label="Subtotal">
          {canEdit ? (
            <MoneyField
              label="Printed subtotal"
              cents={receipt.printedSubtotalCents ?? null}
              allowEmpty
              placeholder="none"
              onSave={(c) => updateReceipt({ printedSubtotalCents: c })}
            />
          ) : (
            <Money cents={receipt.printedSubtotalCents ?? null} />
          )}
        </SummaryRow>
        {(receipt.printedTipCents ?? 0) > 0 && (
          <SummaryRow label="Tip (included in total)">
            <Money cents={receipt.printedTipCents ?? 0} />
          </SummaryRow>
        )}
        <SummaryRow label="Total" strong>
          {canEdit ? (
            <MoneyField
              label="Printed total"
              cents={receipt.printedTotalCents}
              onSave={(c) => c !== null && updateReceipt({ printedTotalCents: c })}
              className="font-semibold"
            />
          ) : (
            <Money cents={receipt.printedTotalCents} />
          )}
        </SummaryRow>
      </section>

      <TipSection
        canEdit={canEdit}
        busy={adding}
        claimableCents={check.claimableCents}
        tipCents={check.tipCents}
        chargedCents={receipt.chargedCents ?? null}
        chargedMismatchCents={check.offByCents === 0 ? check.chargedMismatchCents : null}
        onTip={(c) => void setTip(c)}
        onCharged={setCharged}
      />

      <div className="flex items-baseline justify-between border-t border-border pt-4">
        <span className="text-lg font-semibold">Bill total</span>
        <span className="font-mono text-2xl font-semibold tabular-nums">{formatCents(check.grandTotalCents)}</span>
      </div>
      {check.reconciled && isHost && (
        <p className="-mt-3 text-sm text-primary">Everything adds up. Sharing with friends comes next.</p>
      )}
    </div>
  )
}

function ReceiptMeta({ printedAt, receiptNumber }: { printedAt?: string; receiptNumber?: string }) {
  const parts: string[] = []
  if (printedAt) {
    // Date-only strings parse as UTC midnight (the previous day in the US); pin them to local time.
    const d = new Date(printedAt.length === 10 ? `${printedAt}T00:00` : printedAt)
    if (!Number.isNaN(d.getTime())) {
      parts.push(
        d.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          ...(printedAt.length > 10 ? { hour: 'numeric', minute: '2-digit' } : {}),
        }),
      )
    }
  }
  if (receiptNumber) parts.push(`Check ${receiptNumber}`)
  if (parts.length === 0) return null
  return <p className="text-sm text-muted-foreground">{parts.join(' · ')}</p>
}

function ReceiptPhoto({ imageId }: { imageId: string }) {
  const { readFile } = useR2Files()
  const [open, setOpen] = useState(false)
  // Private (`self` scope) file: it needs the auth header, so it can't be a plain <img src>.
  const photo = useAsyncResource(
    async () => {
      const res = await readFile(imageId)
      if (!res.ok) throw new Error(`Photo unavailable (HTTP ${res.status})`)
      return URL.createObjectURL(await res.blob())
    },
    [imageId],
    { retry: 1 },
  )
  useEffect(() => {
    const url = photo.data
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [photo.data])

  if (photo.status === 'error') {
    return (
      <p className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        Couldn&apos;t load the receipt photo.
        <button type="button" className="font-medium text-foreground underline" onClick={photo.reload}>
          Retry
        </button>
      </p>
    )
  }
  if (!photo.data) return <div className="h-24 animate-pulse rounded-xl bg-muted" aria-label="Loading receipt photo" />

  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="overflow-hidden rounded-xl border border-border bg-card text-left"
      aria-expanded={open}
    >
      <img
        src={photo.data}
        alt="Receipt photo"
        className={cn('w-full object-cover object-top transition-[height]', open ? 'h-auto' : 'h-28')}
      />
      <span className="block px-4 py-2 text-sm text-muted-foreground">
        {open ? 'Tap to shrink' : 'Tap to compare with the receipt'}
      </span>
    </button>
  )
}

function MismatchBanner({
  offByCents,
  suspect,
  canEdit,
  busy,
  onAdjust,
}: {
  offByCents: number
  suspect: 'lines' | 'total' | null
  canEdit: boolean
  busy: boolean
  onAdjust: () => void
}) {
  const direction = offByCents > 0 ? 'short of' : 'over'
  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
      <p className="flex gap-2 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <span>
          <strong>Off by {formatCents(Math.abs(offByCents))}.</strong> The lines come to {formatCents(Math.abs(offByCents))}{' '}
          {direction} the receipt.{' '}
          {suspect === 'total'
            ? "The receipt's own numbers don't add up, so the total or tax was probably misread. Check them against the photo."
            : 'A line price was probably misread. Check the items against the photo.'}
        </span>
      </p>
      {canEdit && (
        <Button variant="outline" size="sm" className="self-start" disabled={busy} onClick={onAdjust}>
          Can&apos;t find it? Add a {formatCents(offByCents)} adjustment
        </Button>
      )}
    </div>
  )
}

function LineRow({
  item,
  canEdit,
  onName,
  onPrice,
  onDelete,
}: {
  item: Item
  canEdit: boolean
  onName: (name: string) => void
  onPrice: (cents: number) => void
  onDelete?: () => void
}) {
  return (
    <li className="flex items-center gap-1 px-2 py-1.5">
      {item.qty > 1 && <span className="pl-2 text-sm text-muted-foreground tabular-nums">{item.qty}×</span>}
      {canEdit ? (
        <>
          <TextField label="Item name" value={item.name} onSave={onName} />
          <MoneyField label={`Price of ${item.name}`} cents={item.priceCents} onSave={(c) => c !== null && onPrice(c)} />
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${item.name}`}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          ) : (
            <span className="w-8" />
          )}
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate px-2 py-1.5">{item.name}</span>
          <Money cents={item.priceCents} className="px-2" />
        </>
      )}
    </li>
  )
}

function AddLineForm({ busy, onAdd }: { busy: boolean; onAdd: (name: string, cents: number) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const cents = parseDollars(price)
  const valid = name.trim().length > 0 && cents !== null

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="self-start" onClick={() => setOpen(true)}>
        <Plus /> Add a missed line
      </Button>
    )
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valid) return
        await onAdd(name.trim(), cents)
        setName('')
        setPrice('')
        setOpen(false)
      }}
    >
      <input
        autoFocus
        aria-label="New line name"
        placeholder="Item"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-input bg-card px-3 py-2 text-base"
      />
      <input
        aria-label="New line price"
        placeholder="$0.00"
        inputMode="decimal"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className="w-24 rounded-md border border-input bg-card px-3 py-2 text-right font-mono text-base"
      />
      <Button type="submit" size="sm" disabled={!valid || busy}>
        Add
      </Button>
    </form>
  )
}

function TipSection({
  canEdit,
  busy,
  claimableCents,
  tipCents,
  chargedCents,
  chargedMismatchCents,
  onTip,
  onCharged,
}: {
  canEdit: boolean
  busy: boolean
  claimableCents: number
  tipCents: number
  chargedCents: number | null
  chargedMismatchCents: number | null
  onTip: (cents: number) => void
  onCharged: (cents: number | null) => void
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">Tip</h2>
      {canEdit && (
        <div className="grid grid-cols-4 gap-2">
          {TIP_PERCENTS.map((p) => {
            const cents = tipForPercent(claimableCents, p)
            const active = tipCents === cents && cents > 0
            return (
              <button
                key={p}
                type="button"
                disabled={busy}
                onClick={() => onTip(cents)}
                aria-pressed={active}
                className={cn(
                  'flex flex-col items-center rounded-lg border px-2 py-2 transition-colors',
                  active ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-accent',
                )}
              >
                <span className="font-medium">{p}%</span>
                <span className={cn('font-mono text-xs tabular-nums', !active && 'text-muted-foreground')}>
                  {formatCents(cents)}
                </span>
              </button>
            )
          })}
          <button
            type="button"
            disabled={busy}
            onClick={() => onTip(0)}
            aria-pressed={tipCents === 0}
            className={cn(
              'rounded-lg border px-2 py-2 text-sm transition-colors',
              tipCents === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-accent',
            )}
          >
            No tip
          </button>
        </div>
      )}
      <div className="flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-2">
        <SummaryRow label="Tip">
          {canEdit ? (
            <MoneyField label="Tip amount" cents={tipCents} onSave={(c) => c !== null && c >= 0 && onTip(c)} />
          ) : (
            <Money cents={tipCents} />
          )}
        </SummaryRow>
        {canEdit && (
          <SummaryRow label="Amount charged to card" hint="Optional. Sets the tip for you.">
            <MoneyField label="Amount charged to card" cents={chargedCents} allowEmpty placeholder="—" onSave={onCharged} />
          </SummaryRow>
        )}
      </div>
      {chargedMismatchCents !== null && chargedMismatchCents !== 0 && (
        <p className="text-sm text-warning">
          The card charge is {formatCents(Math.abs(chargedMismatchCents))}{' '}
          {chargedMismatchCents > 0 ? 'more' : 'less'} than the bill total.
        </p>
      )}
    </section>
  )
}

function SummaryRow({
  label,
  hint,
  strong,
  children,
}: {
  label: string
  hint?: string
  strong?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex flex-col">
        <span className={cn(strong && 'font-semibold')}>{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </div>
  )
}

function Money({ cents, className }: { cents: number | null; className?: string }) {
  return (
    <span className={cn('font-mono tabular-nums', className)}>{cents === null ? '—' : formatCents(cents)}</span>
  )
}
