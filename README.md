# SplitSnap

**Snap the receipt. Share the link. Everyone picks their own.**

SplitSnap turns a photo of a restaurant receipt into a live, shared bill. The host photographs the receipt, AI reads
the line items, friends open a link on their own phones and tap what they had — everyone sees each other's picks
instantly — and when the host locks the bill, each person gets an exact amount and a prefilled Venmo, Cash App or
PayPal link.

**Live:** https://splitsnap.app.space · Built on [DeepSpace](https://docs.deep.space) for the DeepSpace build exercise.

---

## Try it

You need two phones (or a phone and a laptop) and a Google or GitHub account on each.

1. **Host:** open the link, sign in, tap **Take photo** and photograph a receipt. Watch it read the receipt.
2. **Check what we read:** fix anything the AI flagged, add a tip, add your Venmo / Cash App / PayPal handle.
   If the numbers don't add up, the banner says by how much and where to look.
3. **Share with the table:** send the link or show the QR code. A friend who opens it sees the bill and who's
   already picking before they sign in.
4. **Claim live:** everyone taps what they had. Shared items split evenly, or "by how many" (2 of the 3 tacos).
   The host can add guests who won't sign in and pick for them.
5. **Lock:** the host locks once everything is claimed and adds up. Everyone sees what they owe, taps a pay
   button (the amount is filled in), and marks themselves paid.
6. **Optional — card roulette:** everyone who taps "I'm in" puts their share in, the host spins, and every phone
   watches the same reveal of who covers it all. Just for fun; one spin per bill.

Scanning the same receipt twice is caught ("You already scanned this receipt"), and the host can delete bills.

SplitSnap never moves money; the pay buttons hand off to the payment app.

## How it works

```
Phone browser (React + Vite)
  ├─ WebSocket ─────────► App room  app:<APP_ID>   bills index, AI usage caps
  ├─ WebSocket ─────────► Bill room bill:<billId>  receipt, items, claims, participants,
  │                                                 guests, guestClaims, shares (+ presence)
  └─ HTTPS ─────────────► Worker (Hono on Cloudflare)
                            ├─ server actions: parseReceipt, joinBill, addItem, assignItem,
                            │   addGuest, removeGuest, setGuestPaid, lockBill, spinRoulette,
                            │   deleteBill, scansLeft
                            ├─ GET /api/public/bills/:id  (read-only join preview)
                            └─ platform proxy → auth, private file storage, Claude
```

- **Each bill is its own real-time room**, so tables don't contend with each other. Friends' taps write straight to
  the room and every phone updates in milliseconds.
- **Anything that costs money or must be trusted runs on the server**: reading the receipt (Claude through the
  DeepSpace AI proxy — no API keys in the repo), locking, host overrides.
- **One pure function decides who owes what.** `computeShares` ([src/lib/computeShares.ts](src/lib/computeShares.ts))
  runs in the live preview and again on the server at lock, so they can't disagree. Money is integer cents with
  exact fraction arithmetic; items split among whoever claimed them (evenly or by count); fees, tax and tip split in
  proportion to each person's food; rounding pennies go to the host, so shares always sum to the bill exactly.
- **The AI's work is checkable.** It reads the subtotal too, so a three-way check (lines vs. subtotal, subtotal +
  fees + tax + tip vs. total) tells the host *where* a misread is. Hard-to-read lines are flagged. A bill can't be
  locked until it reconciles.

## Security

Permissions are enforced by the server, not the UI. Each person can only claim as themselves (the server stamps the
verified user on every claim), once per item; only the host edits prices; only server actions write final shares
or lock a bill; the AI-usage table is invisible to everyone.

These were attacked directly — forged writes over a raw room connection and direct action calls, the way a
script would, not through the app's buttons — on the live site: **26 / 26 attacks refused.** Results and what each
check proves: [tests/break-it.md](tests/break-it.md). Rerun with `node tests/break-it.run.mjs`.

## Tests

| What | How | Result |
|---|---|---|
| Money math, reconcile, claims, roulette, duplicates, pay links, dates, inputs | `npm run test:unit` (Vitest) | 104 tests, incl. a 2,000-bill randomized check that shares always sum exactly |
| App boots, routes, auth wiring | `npx deepspace test run` (Playwright) | 8 tests |
| Security + full flow on the live site | `node tests/break-it.run.mjs` | 26/26 attacks refused; guests, lock and roulette match hand math to the cent |

## Run it locally

```bash
npm install
npx deepspace auth login
npx deepspace dev start      # http://localhost:5173
```

Receipt photos only upload on the deployed app (DeepSpace's file gateway needs a deploy-minted credential), so the
scan works locally without the photo preview. Deploy with `npx deepspace deploy`.

## Project layout

| Path | What's there |
|---|---|
| `src/actions/` | Server actions (parseReceipt, lockBill, assignItem, guests, …) |
| `src/server/bill-access.ts` | `requireHost()` — the single host/lock check every host-only action uses |
| `src/schemas/` | Collections and their server-enforced permissions |
| `src/lib/` | Pure, tested logic: `computeShares`, `reconcile`, `billMath`, `claims`, `payLinks`, `money`, `dates` |
| `src/components/bill/` | Review, Claim, Split, Invite, Join, Settle screens |
| `tests/` | Break-it script, automated live runner, Playwright specs |
| `PLAN.md`, `AGENT_LOG.md`, `WRITEUP.md` | The plan, how it was built with an AI agent, and the writeup |
