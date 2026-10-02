/** Who's at the table: avatars and the join card. */

import { useState } from 'react'
import { useDisplayName } from 'deepspace'
import { Button, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import { avatarColor, initial } from '@/lib/people'
import { cn } from '@/lib/utils'

export interface Participant {
  userId: string
  displayName: string
  paid: number
}

export function Avatar({ id, name, size = 28, ring }: { id: string; name: string; size?: number; ring?: boolean }) {
  return (
    <span
      title={name}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        ring && 'border-2 border-background',
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.43), background: avatarColor(id) }}
    >
      {initial(name)}
    </span>
  )
}

export function AvatarStack({ people, max = 5 }: { people: Participant[]; max?: number }) {
  const shown = people.slice(0, max)
  return (
    <span className="flex">
      {shown.map((p, i) => (
        <span key={p.userId} className={cn(i > 0 && '-ml-2')}>
          <Avatar id={p.userId} name={p.displayName} ring />
        </span>
      ))}
      {people.length > max && (
        <span className="-ml-2 flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[11px] font-semibold">
          +{people.length - max}
        </span>
      )}
    </span>
  )
}

export function JoinCard({ billId, hostName }: { billId: string; hostName: string }) {
  const suggested = useDisplayName() ?? ''
  const [name, setName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const value = name ?? suggested.split(' ')[0] ?? ''

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border-[1.5px] border-primary bg-primary-soft p-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        try {
          await callAction('joinBill', { billId, displayName: value.trim() })
        } catch (err) {
          toast.error("Couldn't join", err instanceof Error ? err.message : undefined)
        } finally {
          setBusy(false)
        }
      }}
    >
      <div>
        <h2 className="font-display text-lg font-semibold">{hostName} invited you to split this bill</h2>
        <p className="text-sm text-muted-foreground">Join to tap what you had.</p>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Your name at the table
        <input
          value={value}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-input bg-card px-3 py-2 text-base font-normal"
        />
      </label>
      <Button type="submit" size="lg" className="h-12 text-base" disabled={busy || value.trim().length === 0}>
        {busy ? 'Joining…' : 'Join the table'}
      </Button>
    </form>
  )
}
