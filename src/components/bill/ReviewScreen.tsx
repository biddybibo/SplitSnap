/**
 * Review screen ("Check what we read"): the host checks what the AI read
 * against the photo, fixes it inline, sets the tip and their pay handles.
 * Everyone else sees the same bill read-only.
 *
 * Edits go straight to the bill room (`useMutations`); the room's permissions
 * (ownerField: hostId, writableFields) are what actually stop a non-host, and
 * new lines go through the host-only `addItem` action.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsyncResource, useAuth, useMutations, useQuery, useR2Files } from 'deepspace'
import { AlertTriangle, Check, ChevronDown, ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import { formatCents, parseDollars } from '@/lib/money'
import { reconcile, tipForPercent, type LineKind } from '@/lib/reconcile'
import { cn } from '@/lib/utils'
import { HandleField, MoneyField, TextField } from './fields'

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
  payVenmo?: string
  payCashApp?: string
  payPaypal?: string
  hostId: string
}

const TIP_PERCENTS = [15, 18, 20, 22]

const card = 'rounded-xl border border-border bg-card'

export function ReviewScreen({ billId }: { billId: string }) {
  const { userId } = useAuth()
  const receiptQuery = useQuery<ReceiptRow>('receipt')
  const itemsQuery = useQuery<Item>('items', { orderBy: 'createdAt', orderDir: 'asc' })
  const itemMutations = useMutations<Item>('items')
  const receiptMutations = useMutations<ReceiptRow>('receipt')
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)

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
  const fees = items.filter((i) => i.data.kind === 'fee')

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

  const itemCount = claimable.filter((i) => i.data.kind === 'item').length

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-3.5 px-5 pt-2">
      <header className="flex items-center gap-2">
        <Link
          to="/home"
          aria-label="Back to your bills"
          className="-ml-2.5 flex size-11 items-center justify-center rounded-full hover:bg-accent"
        >
          <ChevronLeft className="size-[22px]" />
        </Link>
        <h1 className="font-display text-xl font-semibold">{isHost ? 'Check what we read' : receipt.merchant}</h1>
      </header>

      {/* Summary: photo, restaurant, and whether the numbers add up. */}
      <section className={cn(card, 'flex items-center gap-3 p-2.5')}>
        {isHost && receipt.imageId ? (
          <PhotoThumb imageId={receipt.imageId} open={photoOpen} onToggle={() => setPhotoOpen((o) => !o)} />
        ) : (
          <span className="flex h-[68px] w-[52px] shrink-0 items-center justify-center rounded-md bg-muted text-center text-[10px] text-muted-foreground">
            Receipt
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {canEdit ? (
            <TextField
              label="Restaurant"
              value={receipt.merchant}
              onSave={(merchant) => updateReceipt({ merchant })}
              className="-mx-2 font-semibold"
            />
          ) : (
            <span className="truncate font-semibold">{receipt.merchant}</span>
          )}
          <ReceiptMeta printedAt={receipt.printedAt} receiptNumber={receipt.receiptNumber} />
          {check.offByCents === 0 ? (
            <span className="flex items-center gap-1 text-[13px] font-medium text-success">
              <Check className="size-3.5" />
              {itemCount} {itemCount === 1 ? 'item' : 'items'} read · adds up to the printed total
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[13px] font-medium text-warning">
              <AlertTriangle className="size-3.5" />
              Off by {formatCents(Math.abs(check.offByCents))} ·{' '}
              {check.suspect === 'total' ? 'check the total and tax' : 'check the prices'}
            </span>
          )}
        </div>
      </section>
      {photoOpen && receipt.imageId && <PhotoFull imageId={receipt.imageId} onClose={() => setPhotoOpen(false)} />}

      {!isHost && (
        <p className="text-sm text-muted-foreground">
          The host is checking the receipt. You&apos;ll be able to tap what you had soon.
        </p>
      )}

      {/* Items */}
      <section className={cn(card, 'flex flex-col px-3.5 py-1')}>
        <ul className="flex flex-col">
          {claimable.map((i) => (
            <LineRow
              key={i.recordId}
              item={i.data}
              canEdit={canEdit}
              onName={(name) => updateItem(i.recordId, { name })}
              onPrice={(priceCents) => updateItem(i.recordId, { priceCents, kind: priceCents < 0 ? 'discount' : 'item' })}
              onDelete={() => removeItem(i.recordId)}
            />
          ))}
          {claimable.length === 0 && <li className="py-3 text-sm text-muted-foreground">No items yet.</li>}
        </ul>
        {canEdit && (
          <AddLineForm busy={adding} onAdd={(name, cents) => addLine(cents < 0 ? 'discount' : 'item', name, cents)} />
        )}
      </section>

      {/* Totals + tip */}
      <section className={cn(card, 'flex flex-col gap-2.5 px-3.5 py-3')}>
        <TotalRow label="Subtotal" cents={check.claimableCents} />
        {check.feesCents !== 0 && (
          <TotalRow label={fees.length === 1 ? fees[0].data.name : 'Fees'} cents={check.feesCents} />
        )}
        <TotalRow label="Tax" cents={check.taxCents} />
        {check.adjustmentCents !== 0 && <TotalRow label="Adjustment" cents={check.adjustmentCents} />}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Tip</span>
            {canEdit ? (
              <MoneyField
                label="Tip amount"
                cents={check.tipCents}
                onSave={(c) => c !== null && c >= 0 && void setTip(c)}
                className="-mr-2 text-sm text-muted-foreground"
              />
            ) : (
              <span className="font-mono text-sm text-muted-foreground tabular-nums">{formatCents(check.tipCents)}</span>
            )}
          </div>
          {canEdit && (
            <div className="grid grid-cols-4 gap-1.5">
              {TIP_PERCENTS.map((p) => {
                const cents = tipForPercent(check.claimableCents, p)
                const active = check.tipCents === cents && cents > 0
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={adding}
                    aria-pressed={active}
                    aria-label={`${p}% tip, ${formatCents(cents)}`}
                    // Tapping the active chip again clears the tip.
                    onClick={() => void setTip(active ? 0 : cents)}
                    className={cn(
                      'h-11 rounded-full border text-[13px] transition-colors',
                      active
                        ? 'border-primary bg-primary font-semibold text-primary-foreground'
                        : 'border-input bg-card hover:bg-accent',
                    )}
                  >
                    {p}%
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex items-baseline justify-between border-t border-muted pt-2 font-semibold">
          <span>Total</span>
          <span className="font-mono tabular-nums">{formatCents(check.grandTotalCents)}</span>
        </div>
      </section>

      {canEdit && (
        <ReceiptDetails
          // Open by default only when something needs fixing.
          defaultOpen={check.offByCents !== 0}
          offByCents={check.offByCents}
          suspect={check.suspect}
          busy={adding}
          receipt={receipt}
          charges={charges}
          chargedMismatchCents={check.offByCents === 0 ? check.chargedMismatchCents : null}
          onAdjust={() => addLine('adjustment', 'Adjustment', check.offByCents)}
          onUpdateItem={updateItem}
          onRemoveItem={removeItem}
          onUpdateReceipt={updateReceipt}
          onCharged={setCharged}
        />
      )}

      {canEdit && (
        <section className={cn(card, 'flex flex-col gap-3 px-3.5 py-3')}>
          <div>
            <h2 className="font-semibold">How friends pay you</h2>
            <p className="text-[13px] text-muted-foreground">Add at least one. We&apos;ll remember them for your next bill.</p>
          </div>
          <HandleField
            label="Venmo"
            prefix="@"
            placeholder="your-venmo"
            value={receipt.payVenmo ?? ''}
            onSave={(payVenmo) => updateReceipt({ payVenmo })}
          />
          <HandleField
            label="Cash App"
            prefix="$"
            placeholder="cashtag"
            value={receipt.payCashApp ?? ''}
            onSave={(payCashApp) => updateReceipt({ payCashApp })}
          />
          <HandleField
            label="PayPal"
            prefix="paypal.me/"
            placeholder="name"
            value={receipt.payPaypal ?? ''}
            onSave={(payPaypal) => updateReceipt({ payPaypal })}
          />
        </section>
      )}

      <div className="flex-1" />
      {isHost && (
        <div className="sticky bottom-0 -mx-5 flex flex-col gap-2 bg-background/95 px-5 pb-5 pt-3 backdrop-blur">
          <Button size="lg" className="h-[52px] text-base" disabled>
            Share with the table
          </Button>
          <p className="text-center text-[12.5px] text-muted-foreground">
            {check.reconciled
              ? 'Everything adds up. Sharing with friends is coming next.'
              : 'Fix the numbers above first. Sharing with friends is coming next.'}
          </p>
        </div>
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
  return <span className="truncate text-[13px] text-muted-foreground">{parts.join(' · ')}</span>
}

/** Private (`self` scope) photo: it needs the auth header, so it can't be a plain <img src>. */
function useReceiptPhoto(imageId: string) {
  const { readFile } = useR2Files()
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
  return photo
}

function PhotoThumb({ imageId, open, onToggle }: { imageId: string; open: boolean; onToggle: () => void }) {
  const photo = useReceiptPhoto(imageId)
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? 'Hide the receipt photo' : 'Show the receipt photo'}
      className="h-[68px] w-[52px] shrink-0 overflow-hidden rounded-md bg-muted"
    >
      {photo.data ? (
        <img src={photo.data} alt="" className="size-full object-cover object-top" />
      ) : (
        <span className="text-[10px] text-muted-foreground">{photo.status === 'error' ? 'No photo' : '…'}</span>
      )}
    </button>
  )
}

function PhotoFull({ imageId, onClose }: { imageId: string; onClose: () => void }) {
  const photo = useReceiptPhoto(imageId)
  if (photo.status === 'error') {
    return (
      <p className={cn(card, 'flex items-center justify-between px-4 py-3 text-sm text-muted-foreground')}>
        Couldn&apos;t load the receipt photo.
        <button type="button" className="font-medium text-foreground underline" onClick={photo.reload}>
          Retry
        </button>
      </p>
    )
  }
  if (!photo.data) return <div className="h-40 animate-pulse rounded-xl bg-muted" aria-label="Loading receipt photo" />
  return (
    <button type="button" onClick={onClose} className={cn(card, 'overflow-hidden')} aria-label="Hide the receipt photo">
      <img src={photo.data} alt="Receipt photo" className="w-full" />
    </button>
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
    <li className="flex items-center gap-1.5 border-b border-muted py-2 last:border-b-0">
      {item.qty > 1 && <span className="text-sm text-muted-foreground tabular-nums">{item.qty}×</span>}
      {canEdit ? (
        <>
          <TextField label="Item name" value={item.name} onSave={onName} className="-ml-2" />
          <MoneyField boxed label={`Price of ${item.name}`} cents={item.priceCents} onSave={(c) => c !== null && onPrice(c)} />
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${item.name}`}
              className="-mr-2 flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          ) : (
            <span className="-mr-2 w-9" />
          )}
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate py-1.5">{item.name}</span>
          <span className="font-mono text-sm tabular-nums">{formatCents(item.priceCents)}</span>
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 items-center gap-1 text-left text-sm font-semibold text-primary"
      >
        <Plus className="size-4" /> Add a missed item
      </button>
    )
  }
  return (
    <form
      className="flex items-center gap-2 py-2"
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
        aria-label="New item name"
        placeholder="Item"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-input bg-card px-3 py-2 text-base"
      />
      <input
        aria-label="New item price"
        placeholder="$0.00"
        inputMode="decimal"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className="w-24 rounded-md border border-input bg-card px-3 py-2 text-right font-mono text-base"
      />
      <Button type="submit" size="sm" className="h-10" disabled={!valid || busy}>
        Add
      </Button>
    </form>
  )
}

function TotalRow({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex justify-between text-sm text-muted-foreground">
      <span>{label}</span>
      <span className="font-mono tabular-nums">{formatCents(cents)}</span>
    </div>
  )
}

/** The reconciliation extras, folded away unless something needs fixing. */
function ReceiptDetails({
  defaultOpen,
  offByCents,
  suspect,
  busy,
  receipt,
  charges,
  chargedMismatchCents,
  onAdjust,
  onUpdateItem,
  onRemoveItem,
  onUpdateReceipt,
  onCharged,
}: {
  defaultOpen: boolean
  offByCents: number
  suspect: 'lines' | 'total' | null
  busy: boolean
  receipt: ReceiptRow
  charges: { recordId: string; data: Item }[]
  chargedMismatchCents: number | null
  onAdjust: () => void
  onUpdateItem: (id: string, patch: Partial<Item>) => void
  onRemoveItem: (id: string) => void
  onUpdateReceipt: (patch: Partial<ReceiptRow>) => void
  onCharged: (cents: number | null) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  // Pop open when a fix becomes needed, e.g. after a price edit.
  useEffect(() => {
    if (defaultOpen) setOpen(true)
  }, [defaultOpen])

  return (
    <section className={cn(card, 'flex flex-col px-3.5')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-12 items-center justify-between text-left font-semibold"
      >
        Check against the receipt
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="flex flex-col gap-4 pb-3.5">
          {offByCents !== 0 && (
            <div role="status" className="flex flex-col gap-2.5 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning">
              <p>
                <strong>
                  The lines come to {formatCents(Math.abs(offByCents))} {offByCents > 0 ? 'less' : 'more'} than the
                  receipt.
                </strong>{' '}
                {suspect === 'total'
                  ? "The receipt's own numbers don't add up, so the total or tax was probably misread."
                  : 'A price was probably misread.'}{' '}
                Compare with the photo.
              </p>
              <Button variant="outline" size="sm" className="self-start bg-card" disabled={busy} onClick={onAdjust}>
                Can&apos;t find it? Add a {formatCents(offByCents)} adjustment
              </Button>
            </div>
          )}

          <div className="flex flex-col">
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">Fees and tax</h3>
            <ul className="flex flex-col">
              {charges.map((i) => (
                <LineRow
                  key={i.recordId}
                  item={i.data}
                  canEdit
                  onName={(name) => onUpdateItem(i.recordId, { name })}
                  onPrice={(priceCents) => onUpdateItem(i.recordId, { priceCents })}
                  onDelete={i.data.kind === 'tax' ? undefined : () => onRemoveItem(i.recordId)}
                />
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-1">
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">
              Printed on the receipt
            </h3>
            <DetailRow label="Subtotal">
              <MoneyField
                boxed
                label="Printed subtotal"
                cents={receipt.printedSubtotalCents ?? null}
                allowEmpty
                placeholder="none"
                onSave={(c) => onUpdateReceipt({ printedSubtotalCents: c })}
              />
            </DetailRow>
            {(receipt.printedTipCents ?? 0) > 0 && (
              <DetailRow label="Tip (already in the total)">
                <MoneyField
                  boxed
                  label="Printed tip"
                  cents={receipt.printedTipCents ?? 0}
                  onSave={(c) => c !== null && onUpdateReceipt({ printedTipCents: c })}
                />
              </DetailRow>
            )}
            <DetailRow label="Total">
              <MoneyField
                boxed
                label="Printed total"
                cents={receipt.printedTotalCents}
                onSave={(c) => c !== null && onUpdateReceipt({ printedTotalCents: c })}
              />
            </DetailRow>
          </div>

          <div className="flex flex-col gap-1">
            <DetailRow label="Amount charged to card" hint="Optional. Sets the tip for you.">
              <MoneyField
                boxed
                label="Amount charged to card"
                cents={receipt.chargedCents ?? null}
                allowEmpty
                placeholder="—"
                onSave={onCharged}
              />
            </DetailRow>
            {chargedMismatchCents !== null && chargedMismatchCents !== 0 && (
              <p className="text-sm text-warning">
                The card charge is {formatCents(Math.abs(chargedMismatchCents))}{' '}
                {chargedMismatchCents > 0 ? 'more' : 'less'} than the bill total.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function DetailRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="flex flex-col text-sm">
        <span>{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </div>
  )
}
