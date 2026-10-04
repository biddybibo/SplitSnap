# Break-it tests (run on the deployed URL)

These try to cheat **the way an attacker would**: not through the app's buttons, but by opening their own
connection to a bill's room and sending forged writes, and by calling server actions directly. Every check
should come back **PASS** (the server refused it, or neutralised it).

## How to run

1. Open a bill on `https://splitsnap.app.space/b/<bill-id>` in Chrome on a laptop (easier than a phone).
   - **Friend run:** signed in as an account that **joined** the bill but is **not** the host. Claim at least
     one item first.
   - **Host run:** signed in as the host.
2. Open DevTools → **Console** (⌘ ⌥ J). Chrome may ask you to type `allow pasting` first.
3. Paste the whole script below and press Enter. It prints a table; copy it into AGENT_LOG.md.

The script only touches the bill you're on. The one write that is *supposed* to be accepted (your own claim
in check 1) is deleted again at the end.

```js
(async () => {
  const billId = location.pathname.match(/^\/b\/([0-9a-f-]{36})/)?.[1]
  if (!billId) return console.error('Open a bill page (/b/<id>) first.')
  const { token } = await (await fetch('/api/auth/token', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })).json()
  if (!token) return console.error('Not signed in.')
  const me = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub
  const results = []
  const record = (check, pass, detail) => results.push({ check, result: pass ? 'PASS' : 'FAIL', detail: String(detail).slice(0, 90) })

  // A raw room connection, the way a script (not the app) would talk to the server.
  const open = (room) => new Promise((ok, fail) => {
    const ws = new WebSocket(`wss://${location.host}/ws/${room}?token=${encodeURIComponent(token)}`)
    ws.onopen = () => ok(ws)
    ws.onerror = () => fail(new Error('socket failed'))
  })
  const exchange = (ws, msg, match) => new Promise((ok) => {
    const t = setTimeout(() => ok({ timeout: true }), 6000)
    const onMsg = (m) => {
      const d = JSON.parse(m.data)
      if (match(d)) { clearTimeout(t); ws.removeEventListener('message', onMsg); ok(d) }
    }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify(msg))
  })
  const id = () => 'breakit-' + Math.random().toString(36).slice(2)
  const read = async (ws, collection) => {
    const subscriptionId = id()
    const r = await exchange(ws, { type: 'core.subscribe', payload: { subscriptionId, query: { collection } } },
      (d) => d.type === 'core.query_result' && d.payload.subscriptionId === subscriptionId)
    return r.timeout ? [] : r.payload.records
  }
  const put = async (ws, collection, recordId, data) => {
    const requestId = id()
    const r = await exchange(ws, { type: 'core.put', payload: { collection, recordId, data, requestId } },
      (d) => (d.type === 'records.ack' && d.payload.requestId === requestId) || d.type === 'core.error')
    if (r.timeout) return { success: false, error: 'no reply (treated as refused)' }
    return r.type === 'core.error' ? { success: false, error: r.payload.error } : r.payload
  }
  const del = async (ws, collection, recordId) => {
    const requestId = id()
    return exchange(ws, { type: 'core.delete', payload: { collection, recordId, requestId } },
      (d) => d.type === 'records.ack' && d.payload.requestId === requestId)
  }
  const action = async (name, params) =>
    (await fetch(`/api/actions/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(params) })).json()
  const refused = (r) => !r.success

  const bill = await open(`bill:${billId}`)
  const receipt = (await read(bill, 'receipt'))[0]
  const items = await read(bill, 'items')
  const people = await read(bill, 'participants')
  const hostId = receipt?.data?.hostId
  const isHost = hostId === me
  const item = items.find((i) => i.data.kind === 'item')
  console.log(`Running as ${isHost ? 'HOST' : 'FRIEND'} on bill ${billId} (${items.length} lines, ${people.length} people)`)

  if (!isHost) {
    // 1. Forge a claim for the host. The room must stamp MY id over the one I send.
    const forgedId = id()
    const r1 = await put(bill, 'claims', forgedId, { itemId: item.recordId, userId: hostId })
    const stored = (await read(bill, 'claims')).find((c) => c.recordId === forgedId)
    record('1. Forge a claim as the host', !stored || stored.data.userId !== hostId,
      stored ? `stored as ${stored.data.userId === me ? 'me (userBound)' : stored.data.userId}` : `refused: ${r1.error}`)
    // 2. Claim the same item twice.
    const r2 = await put(bill, 'claims', id(), { itemId: item.recordId })
    record('2. Claim the same item twice', refused(r2), r2.error ?? 'accepted')
    if (stored) await del(bill, 'claims', forgedId)
    // 3. Change a price as a non-host.
    const r3 = await put(bill, 'items', item.recordId, { priceCents: 1 })
    record('3. Edit an item price', refused(r3), r3.error ?? 'accepted')
    // 4. Add a line as a non-host.
    const r4 = await put(bill, 'items', id(), { name: 'Free money', qty: 1, priceCents: -100000, kind: 'discount' })
    record('4. Add an item', refused(r4), r4.error ?? 'accepted')
    // 5. Write my own final share.
    const r5 = await put(bill, 'shares', id(), { userId: me, totalCents: 0 })
    record('5. Write a share', refused(r5), r5.error ?? 'accepted')
    // 6. Lock the bill by writing lockedAt.
    const r6 = await put(bill, 'receipt', 'receipt', { lockedAt: new Date().toISOString() })
    record('6. Set receipt.lockedAt', refused(r6), r6.error ?? 'accepted')
    // 7. Mark someone else as paid.
    const other = people.find((p) => p.data.userId !== me)
    if (other) {
      const r7 = await put(bill, 'participants', other.recordId, { paid: 1 })
      record("7. Mark someone else paid", refused(r7), r7.error ?? 'accepted')
    }
    // 8–9. Host-only actions.
    const r8 = await action('lockBill', { billId })
    record('8. Call lockBill', refused(r8), r8.error ?? 'accepted')
    const r9 = await action('assignItem', { billId, itemId: item.recordId, assignments: [{ userId: me }] })
    record('9. Call assignItem', refused(r9), r9.error ?? 'accepted')
    // 10. Add a line through the action.
    const r10 = await action('addItem', { billId, kind: 'discount', name: 'Free money', priceCents: -100000 })
    record('10. Call addItem', refused(r10), r10.error ?? 'accepted')
  } else {
    // Even the host can't lock by hand or write the shares: only lockBill can.
    const h1 = await put(bill, 'receipt', 'receipt', { lockedAt: new Date().toISOString() })
    record('H1. Host sets receipt.lockedAt', refused(h1), h1.error ?? 'accepted')
    const h2 = await put(bill, 'shares', id(), { userId: me, totalCents: 0 })
    record('H2. Host writes a share', refused(h2), h2.error ?? 'accepted')
    const h3 = await put(bill, 'items', id(), { name: 'Sneaky', qty: 1, priceCents: 100, kind: 'item' })
    record('H3. Host adds an item without addItem', refused(h3), h3.error ?? 'accepted')
    const friend = people.find((p) => p.data.userId !== me)
    if (friend) {
      const h4 = await put(bill, 'participants', friend.recordId, { paid: 1 })
      record("H4. Host marks a friend paid", refused(h4), h4.error ?? 'accepted')
    }
  }

  // Everyone: the app room's private AI-usage table. (The app id is public; it's in wrangler.toml.)
  const app = await open('app:app_01M3XE8GBEC0H4VJB2TQCF821S').catch(() => null)
  if (app) {
    const u = await read(app, 'usage')
    record('U1. Read the AI usage table', u.length === 0, `${u.length} rows visible`)
    app.close()
  }

  // Public preview leaks nothing private.
  const preview = await (await fetch(`/api/public/bills/${billId}`)).json()
  const leaked = JSON.stringify(preview).match(/@|userId|hostId|recordId|email|payVenmo|payCashApp|payPaypal|imageId/)
  record('P1. Public preview has no ids, emails or handles', !leaked, leaked ? `found "${leaked[0]}"` : 'clean')

  bill.close()
  console.table(results)
  console.log(results.every((r) => r.result === 'PASS') ? 'All checks passed.' : 'Some checks FAILED — send the table to the agent.')
})()
```

## What each check proves

| # | Attack | Expected | Enforced by |
|---|---|---|---|
| 1 | Claim an item *as the host* | Stored under **your** id | `claims.userId` is `userBound` |
| 2 | Claim the same item twice | Refused: "Duplicate" | `uniqueOn: [itemId, userId]` |
| 3 | Change a price as a friend | Refused | `items` update `own` via `ownerField: hostId` |
| 4 | Add a line as a friend | Refused | `items` create `false` |
| 5 | Write your own final share | Refused | `shares`: no member writes |
| 6 | Lock the bill by hand | Refused | `receipt` update is host-only |
| 7 | Mark someone else paid | Refused | `participants` update `own` |
| 8–10 | Call host-only actions | "Only the host…" | `lockBill`, `assignItem`, `addItem` check `bills.hostId` |
| H1–H2 | Host locks or writes shares by hand | Refused | `lockedAt` not in host `writableFields`; `shares` no writes |
| H3 | Host adds a line without `addItem` | Refused | `items` create `false` for everyone |
| H4 | Host marks a friend paid | Refused | `participants` update `own` |
| U1 | Read the AI usage table | 0 rows | `usage`: no access for any role |
| P1 | Public preview leaks private data | Clean | `/api/public/bills/:id` returns a fixed summary |
