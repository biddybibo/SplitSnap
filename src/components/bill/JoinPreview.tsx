/**
 * "Friend opens the link" (design: Join.dc.html): what a signed-out friend sees
 * on a bill link. Reads the public preview endpoint (no sign-in), refreshes it
 * every few seconds so "Maya and Dev are picking" stays live, and signs in
 * straight back to this bill.
 */

import { useEffect } from 'react'
import { useAsyncResource } from 'deepspace'
import { formatCents } from '@/lib/money'
import { AVATAR_COLORS } from '@/lib/people'
import { rememberReturnPath } from '@/lib/returnTo'

interface Preview {
  hostName: string | null
  hostColor: number
  merchant: string
  printedAt: string | null
  locked: boolean
  totalCents: number
  itemCount: number
  items: { name: string; priceCents: number; claimers: { name: string; color: number }[] }[]
  pickers: string[]
}

function when(printedAt: string | null): string {
  if (!printedAt) return ''
  const d = new Date(printedAt.length === 10 ? `${printedAt}T00:00` : printedAt)
  if (Number.isNaN(d.getTime())) return ''
  return d.toDateString() === new Date().toDateString() ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function Initial({ name, color, size }: { name: string; color: number; size: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.48), background: AVATAR_COLORS[color % AVATAR_COLORS.length] }}
    >
      {(name[0] ?? '?').toUpperCase()}
    </span>
  )
}

export function JoinPreview({ billId, path }: { billId: string; path: string }) {
  const preview = useAsyncResource<Preview>(
    async (signal) => {
      const res = await fetch(`/api/public/bills/${billId}`, { signal })
      if (res.status === 404) throw new Error('not-found')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as Preview
    },
    [billId],
    { retry: 1 },
  )

  // Keep "who's picking" live while the friend decides.
  const { reload } = preview
  useEffect(() => {
    const t = setInterval(reload, 8000)
    return () => clearInterval(t)
  }, [reload])

  function signIn(provider: 'google' | 'github') {
    rememberReturnPath(path) // sign-in lands on /home, which sends them back here
    window.location.href = `/api/auth/social-redirect?provider=${provider}`
  }

  const p = preview.data
  const host = p?.hostName ?? 'A friend'

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-[18px] px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
      {preview.status === 'error' && preview.error === 'not-found' ? (
        <p className="text-muted-foreground">This bill link doesn&apos;t exist or has expired. Ask whoever sent it for a new one.</p>
      ) : !p ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <div className="h-8 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-40 animate-pulse rounded-[14px] bg-muted" />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              {p.hostName && <Initial name={p.hostName} color={p.hostColor} size={30} />}
              {host} invited you to split
            </span>
            <h1 className="font-display text-[32px] font-semibold leading-tight tracking-tight">{p.merchant}</h1>
            <span className="text-sm text-muted-foreground">
              {[when(p.printedAt), `${p.itemCount} ${p.itemCount === 1 ? 'item' : 'items'}`].filter(Boolean).join(' · ')} ·{' '}
              <span className="font-mono text-foreground">{formatCents(p.totalCents)}</span> total
            </span>
          </div>

          <section className="flex flex-col rounded-[14px] border border-border bg-card px-3.5 pb-2.5 pt-1.5">
            <div className="flex items-center justify-between pb-1.5 pt-2">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.6px] text-muted-foreground">On the bill</h2>
              {p.pickers.length > 0 && !p.locked && (
                <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-success">
                  <span className="size-[7px] rounded-full bg-success" aria-hidden />
                  {p.pickers.length === 1
                    ? `${p.pickers[0]} is picking`
                    : `${p.pickers.slice(0, -1).join(', ')} and ${p.pickers[p.pickers.length - 1]} are picking`}
                </span>
              )}
            </div>
            {p.items.map((it, i) => (
              <div key={i} className="flex items-center justify-between border-t border-muted py-2.5 text-[14.5px]">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{it.name}</span>
                  {it.claimers.slice(0, 3).map((cl, j) => (
                    <Initial key={j} name={cl.name} color={cl.color} size={20} />
                  ))}
                </span>
                <span className="font-mono text-muted-foreground">{formatCents(it.priceCents)}</span>
              </div>
            ))}
            {p.itemCount > p.items.length && (
              <div className="border-t border-muted pt-2 text-[13px] text-muted-foreground">
                + {p.itemCount - p.items.length} more {p.itemCount - p.items.length === 1 ? 'item' : 'items'}
              </div>
            )}
          </section>
        </>
      )}

      <div className="flex-1" />
      <div className="flex flex-col gap-2.5">
        <h2 className="font-display text-lg font-semibold">
          {p?.locked ? 'Sign in to see what you owe' : 'Sign in to pick what you had'}
        </h2>
        <button
          type="button"
          onClick={() => signIn('google')}
          className="flex h-[52px] items-center justify-center gap-2.5 rounded-xl bg-foreground text-base font-semibold text-background"
        >
          Continue with Google
        </button>
        <button
          type="button"
          onClick={() => signIn('github')}
          className="flex h-[52px] items-center justify-center rounded-xl border border-input bg-card text-base font-semibold"
        >
          Continue with GitHub
        </button>
        <p className="text-center text-[12.5px] leading-snug text-muted-foreground">
          No app to install. We only see your name and photo, never your payment details.
        </p>
      </div>
    </div>
  )
}
