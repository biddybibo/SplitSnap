# SplitSnap — project context for Claude Code

SplitSnap is a take-home build exercise for DeepSpace (deadline Mon Oct 5, 2026, 11:59 PM ET / 8:59 PM PT).
A host photographs a receipt, AI extracts the line items, friends open a shared link on their phones and
claim what they had in real time, and everyone gets an exact amount plus Venmo/Cash App/PayPal links.

Full spec: `PLAN.md`. Read it before starting any new slice of work.

## How we work
- Use the deepspace skill and the SDK docs (https://docs.deep.space) as the source of truth. Do not guess SDK APIs.
- Work one slice at a time (one schema, one screen, or one action). Stop after each slice so I can review the diff.
- Don't refactor or touch files outside the current slice.
- `src/lib/computeShares.ts` + tests: written by the agent at my request (2026-10-02); I review and verify them.
  Don't change its rules without asking.
- After each session, add a line to `AGENT_LOG.md`: what I asked for, what you produced, what I changed.

## Architecture decisions (already made)
- Web app, mobile-first (390px wide phones). No native app.
- App room `app:<APP_ID>` holds `bills` (index) and `usage` (AI caps). Each bill gets its own room `bill:<billId>`
  holding `receipt`, `items`, `claims`, `participants`, `guests`, `guestClaims`, `shares`.
- Every RecordRoom registers the full schema list (`src/schemas.ts`), so every collection exists in every room.
  Permissions must hold whichever room a collection lands in.
- `userBound` stamps the writer's id on every write, server actions included. A column that must hold someone else's
  id (shares.userId, guest rows) is never userBound.
- Action `tools` reach the app room. For a bill room, build a second set:
  `createActionTools(env, userId, callerJwt, "bill:<billId>")` from `src/server/action-tools.ts`.
- Money is integer cents everywhere. Leftover rounding pennies go to the host so shares sum to the receipt total.
- `computeShares(items, claims)` is one pure function used by the client preview AND the server `lockBill` action.
- Shared items split evenly among claimants; `fee` (service charge etc.), tax, tip and `adjustment` lines split in
  proportion to each person's subtotal. Only `item`/`discount` lines are claimed.
- Item `priceCents` is the line total (qty already applied).
- The printed total (plus tip) is the bill. The host can enter "amount charged to card"; then tip = charged − printed total.
- Callers merge `claims` + `guestClaims` into one claim list before `computeShares` (guest id `guest:<guestId>`).

## Server actions
- `parseReceipt`: signed-in only, max 10/user/day (`usage`), image ≤ 5 MB, Claude via `createDeepSpaceAI` +
  `generateText` + `Output.object` (Zod: merchant, items[{name, qty, priceCents}], subtotalCents (nullable),
  fees[{name, cents}], taxCents, tipCents, totalCents). `generateObject` is deprecated in ai@7.
  Three-way check: lines = printed subtotal, and subtotal + fees + tax + tip = printed total; report which failed so the UI
  can point at the line(s) or the total. Flag mismatches, don't hide them. Write `receipt` + `items` with `tools.create`.
- `lockBill`: host-only (check caller against `bills.hostId`). Refuse if any item is unclaimed, or unless
  items + fees + tax + adjustments = printed total to the cent (and printed total + tip = `chargedCents` when set).
  Merge claims + guestClaims, run `computeShares`, write `shares`, set status `locked`.
- `addItem`: host-only (checked against `bills.hostId`); adds a line (tip, adjustment, a missed item). Members can't
  create `items`.
- Reconcile rules live in `src/lib/reconcile.ts` (review screen and `lockBill` must both use it). A printed tip is
  inside `printedTotalCents`; an added tip is on top. `parseReceipt` also stores `receiptNumber` / `printedAt` for
  duplicate detection (never card digits).
- `joinBill`: creates the caller's `participants` row and adds them to `bills.participantIds` so the bill shows in
  their list (members can't write `bills`). It writes `bills` *as the host* (id read from the bill) so a userBound
  re-stamp can never put a friend in `hostId`, and re-reads to survive two friends joining at once. The host calls
  it on first share to get their own participants row.
- `addGuest` / `removeGuest` / `setGuestPaid`: host-only. Picking for a guest is `assignItem` with
  `guest:<guestId>` (no separate claimForGuest); it writes `guestClaims`. The only writers of `guests` / `guestClaims`.
- Client screens read people and claims through `useTable()` (participants + guests, claims + guestClaims).
- Every host-only action starts with `requireHost()` (`src/server/bill-access.ts`): the single place that checks the
  caller is the bill's host (from `bills.hostId`, never params) and that the bill isn't locked.
- `deleteBill` (host-only) clears every bill-room collection, then the index row. `parseReceipt` always creates the
  bill and reports a likely duplicate (`src/lib/duplicates.ts`); the client offers "open the earlier one".
- Card roulette: `rouletteEntries` (own opt-ins, userBound) + `rouletteResult` (no member writes; `spinRoulette`
  host-only, once, after lock, crypto draw). Settle amounts come from `amountOwed()` in `src/lib/roulette.ts`.
- Screens derive the reconcile check, claim display and shares from `billMath()` (`src/lib/billMath.ts`), never
  their own copies. Bill ids: `isBillId` / `BILL_ID_PATTERN` (`src/shared/ids.ts`).

## Design decisions from the "gaps" boards (2026-10-02)
- `assignItem` (host-only): writes claims on behalf of people already at the table ("Who had it?", "Split with
  everyone"). Normal claims stay self-only. Non-host callers refused (break-it test).
- Split by how many: claims carry optional `units`. If every claim on a line has units, the line splits by units
  and lock requires units to cover the line's qty; otherwise it splits evenly. Each person sets their own units;
  setting someone else's goes through a host-only action.
- Public bill preview: unauthenticated `GET /api/public/bills/:id` returns only what the "Friend opens the link"
  board shows (host first name, restaurant, total, item count, first items with claimer initials). Read-only.
- "Share anyway, the host covers the difference": a `hostAdjustment` line charged to the host alone (not split
  by subtotal). It reconciles the bill; friends pay only for what's on the lines.
- AI flags uncertain lines (`flagged`, `flagNote` on items); editing the price clears the flag.
- `remindUnpaid` (built as the "nudge"): host-only, after lock; emails people who still owe via the `email/send`
  integration (not `resend/send-email`, which the docs still show) from `SplitSnap <noreply@app.space>` — the app's
  own subdomain isn't a verified sender. Emails are read server-side only and never returned; one email per person
  per 6 h (`reminders` collection). Text reminders are `sms:` links from the host's own phone (no numbers stored).

## Permissions (must hold server-side, not just in UI)
- `items`: `ownerField: hostId` (userBound) — only the host edits/deletes; create false (actions only).
- `claims`: `userId` is `userBound` + `immutable`; `uniqueOn: [itemId, userId]`; update/delete `own`.
- `receipt`: `ownerField: hostId` — only the host edits the printed numbers / amount charged.
- `guestClaims`: read true, no member writes; written only by `assignItem` (host-only, `guest:<guestId>`).
- `participants`: create true, update `own` (the "I paid" toggle), `uniqueOn: [userId]`.
- `guests`: read true, no member writes; written only by `addGuest`.
- `shares`: no member writes; written only by `lockBill`.
- `usage`: no member access.
- Keep the scaffold's users schema `read: 'own'`.

## Security and cost rules
- Every UI that triggers a paid integration is behind `useAuth().isSignedIn`, disabled while in flight.
- Receipts upload with `useR2Files()` default `self` scope (private), never `scope: 'app'`.
- No API keys or secrets in the repo. Integrations go through the DeepSpace proxy; anything else via `deepspace secrets`.
- Use `useAsyncResource` for integration-backed UI (loading / error with retry / empty / success).

## Design
- Mockups (source of truth for layout and look): https://claude.ai/artifact/9QjWESh735oucWXhV2vQoa
- Theme `splitsnap` in `src/themes.css`; fonts in `index.html`; `font-display` for headings, `font-mono` for money.
- Pay handles live on the bill's `receipt` row (friends can't read the host's `users` row); `cleanHandle` strips
  everything but letters, digits and `- _ .` before saving.

## Out of scope
Moving money in-app, multi-currency, receipt history/analytics, native mobile app,
reading bank transactions. Stretch only if the core path works: host-added guests (built), email nudges (built as `remindUnpaid`), daily reminder
cron, presence indicator. Future: "claim your spot" link for guests via the share sheet.

## Core path that must work on the deployed URL
1. Host signs in, uploads/snaps a receipt.
2. AI extracts items/subtotal/tax/total; host checks against the photo, fixes mistakes inline, adds the tip.
3. Host shares the link; friends sign in and claim items live.
4. Host locks; everyone sees their final amount + pay links and can mark themselves paid.
