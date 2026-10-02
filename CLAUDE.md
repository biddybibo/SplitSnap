# SplitSnap — project context for Claude Code

SplitSnap is a take-home build exercise for DeepSpace (deadline Mon Oct 5, 2026, 11:59 PM ET / 8:59 PM PT).
A host photographs a receipt, AI extracts the line items, friends open a shared link on their phones and
claim what they had in real time, and everyone gets an exact amount plus Venmo/Cash App/PayPal links.

Full spec: `PLAN.md`. Read it before starting any new slice of work.

## How we work
- Use the deepspace skill and the SDK docs (https://docs.deep.space) as the source of truth. Do not guess SDK APIs.
- Work one slice at a time (one schema, one screen, or one action). Stop after each slice so I can review the diff.
- Don't refactor or touch files outside the current slice.
- I write `src/lib/computeShares.ts` and its tests myself. Do not edit it unless I ask.
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
- `addItem`: host-only; adds a line (tip, adjustment, a missed item). Members can't create `items`.
- `joinBill`: adds the caller to `bills.participantIds` so the bill shows in their list (members can't write `bills`).
- `addGuest` / `claimForGuest` (stretch): host-only. The only writers of `guests` and `guestClaims`.
- `nudgeUnpaid` (stretch): host-only, emails unpaid participants via `resend/send-email`. Emails never returned to client.

## Permissions (must hold server-side, not just in UI)
- `items`: `ownerField: hostId` (userBound) — only the host edits/deletes; create false (actions only).
- `claims`: `userId` is `userBound` + `immutable`; `uniqueOn: [itemId, userId]`; update/delete `own`.
- `receipt`: `ownerField: hostId` — only the host edits the printed numbers / amount charged.
- `guestClaims`: read true, no member writes; written only by `claimForGuest`.
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

## Out of scope
Moving money in-app, multi-currency, uneven per-item splits, receipt history/analytics, native mobile app,
reading bank transactions. Stretch only if the core path works: host-added guests, Resend nudges, daily reminder
cron, presence indicator. Future: "claim your spot" link for guests via the share sheet.

## Core path that must work on the deployed URL
1. Host signs in, uploads/snaps a receipt.
2. AI extracts items/subtotal/tax/total; host checks against the photo, fixes mistakes inline, adds the tip.
3. Host shares the link; friends sign in and claim items live.
4. Host locks; everyone sees their final amount + pay links and can mark themselves paid.
