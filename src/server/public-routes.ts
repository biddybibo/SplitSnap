/**
 * The one unauthenticated read in the app: a bill preview for the "Friend opens
 * the link" screen, so a signed-out friend sees what they're joining before they
 * sign in. It returns exactly what that screen shows and nothing else — no user
 * ids, emails, per-person amounts, pay handles or photo — and only for a known
 * bill id (random UUIDs, so only people with the link can ask).
 */

import type { Hono } from 'hono'
import type { AppContext, Env } from '../../worker.js'

const BILL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SHOWN_ITEMS = 4

interface Envelope<T> {
  recordId: string
  data: T
}

async function readRoom<T>(env: Env, roomId: string, tool: string, params: Record<string, unknown>): Promise<T | null> {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(roomId))
  const res = await stub.fetch(
    new Request('https://internal/api/tools/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': env.OWNER_USER_ID, 'X-App-Action': 'true' },
      body: JSON.stringify({ tool, params }),
    }),
  )
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T } | null
  return json?.success ? (json.data ?? null) : null
}

export function registerPublicRoutes(app: Hono<AppContext>): void {
  app.get('/api/public/bills/:id', async (c) => {
    const id = c.req.param('id')
    if (!BILL_ID.test(id)) return c.json({ error: 'Not found' }, 404)
    const room = `bill:${id}`
    const [receipt, items, claims, people] = await Promise.all([
      readRoom<{ record: Envelope<{ merchant?: string; hostId?: string; printedAt?: string; lockedAt?: string }> }>(
        c.env, room, 'records.get', { collection: 'receipt', recordId: 'receipt' },
      ),
      readRoom<{ records: Envelope<{ name: string; priceCents: number; kind: string }>[] }>(c.env, room, 'records.query', {
        collection: 'items', orderBy: 'createdAt', orderDir: 'asc', limit: 200,
      }),
      readRoom<{ records: Envelope<{ itemId: string; userId: string }>[] }>(c.env, room, 'records.query', {
        collection: 'claims', limit: 1000,
      }),
      readRoom<{ records: Envelope<{ userId: string; displayName: string }>[] }>(c.env, room, 'records.query', {
        collection: 'participants', orderBy: 'createdAt', orderDir: 'asc', limit: 200,
      }),
    ])
    const r = receipt?.record?.data
    if (!r?.hostId) return c.json({ error: 'Not found' }, 404)

    const lines = items?.records ?? []
    const seated = people?.records ?? []
    const firstName = (n: string) => n.trim().split(/\s+/)[0]?.slice(0, 20) || 'Someone'
    const nameOf = new Map(seated.map((p) => [p.data.userId, firstName(p.data.displayName)]))
    // Avatars are colored by a hash of the user id on every screen; send that index, never the id itself.
    const colorOf = (uid: string) => {
      let h = 0
      for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0
      return h % 6
    }
    const claimable = lines.filter((l) => l.data.kind === 'item' || l.data.kind === 'discount')
    const claimers = (itemId: string) =>
      (claims?.records ?? [])
        .filter((cl) => cl.data.itemId === itemId)
        .map((cl) => ({ name: nameOf.get(cl.data.userId) ?? 'Someone', color: colorOf(cl.data.userId) }))
    const pickers = [...new Set((claims?.records ?? []).map((cl) => cl.data.userId))]
      .map((uid) => nameOf.get(uid))
      .filter((n): n is string => Boolean(n))

    c.header('Cache-Control', 'no-store')
    return c.json({
      hostName: nameOf.get(r.hostId) ?? null,
      hostColor: colorOf(r.hostId),
      merchant: (r.merchant ?? 'A bill').slice(0, 80),
      printedAt: r.printedAt || null,
      locked: Boolean(r.lockedAt),
      totalCents: lines.reduce((s, l) => s + l.data.priceCents, 0),
      itemCount: claimable.length,
      items: claimable.slice(0, SHOWN_ITEMS).map((l) => ({
        name: l.data.name.slice(0, 80),
        priceCents: l.data.priceCents,
        claimers: claimers(l.recordId),
      })),
      pickers: pickers.slice(0, 3),
    })
  })
}
