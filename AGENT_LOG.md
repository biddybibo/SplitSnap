# Agent log

One entry per session: what I asked for, what the agent produced, what I verified, changed or rejected, and why.

## 2026-10-01 — Planning
- Asked: pick a project for the DeepSpace build exercise, then plan architecture and mock the screens.
- Agent produced: SplitSnap plan (docs/PLAN.md), CLAUDE.md, four phone mockups.
- I decided: SplitSnap over the other ideas; web app, mobile-first.
- Verified / changed: 

## 2026-10-01 — Scaffold + parse spike
- Asked: throwaway parseReceipt spike (signed-in action, image → Claude via createDeepSpaceAI + generateObject → JSON) and a bare test page.
- Agent produced: `src/actions/parseReceipt.ts` (owner-billed, claude-sonnet-5, ≤5 MB, jpeg/png/webp), registered in `src/actions/index.ts`; `/spike` page under `(protected)` that resizes to 1600px JPEG and prints the JSON. Noted `generateObject` is deprecated in ai@7 (still works).
- Verified / changed: 
- Parse accuracy on real receipts: #1 DINEFINE (iPhone photo, 215 KB, 4.3 s) — merchant, 4 items, tax read; items+tax = 6330 vs total 5130. Off by exactly 1200 (Caesar salad 2400). I suspect the sample receipt's own math is wrong, so this may be a faithful read, not a misread — to confirm against the receipt. Either way the sum check is required; use real paper receipts for accuracy testing.
  #2 The Tack Room (real receipt, 445 KB, 6.3 s) — 7 items, qty 2 read correctly as line total; items + tax = total exactly. Tip 0 (pre-tip bill) → review screen needs host-editable tip.

## 2026-10-01 — Design decisions (guests, reconciling totals)
- Asked: resolve guest claims and what happens when lines and printed total disagree; update PLAN.md + CLAUDE.md.
- Agent produced: doc updates for Option C guests (`guestClaims` + host-only `addGuest`/`claimForGuest`), new `receipt`
  collection, `adjustment` item kind, three-way check with `subtotalCents`, reconcile-before-lock, tip / amount-charged
  field, receipt photo on review. Fixed the `docs/PLAN.md` path.
- I decided: guests via host-only actions (stretch), self sign-in stays the core path; printed total is the bill;
  bank-transaction verification rejected (consent/compliance, tipped charge posts days later) in favor of a manual
  "amount charged" field.
- Verified / changed: 

## 2026-10-02 — Slice 1: schemas + permissions
- Asked: all collections and permissions per CLAUDE.md / PLAN.md.
- Agent produced: `src/schemas/app-room-schemas.ts` (bills, usage), `src/schemas/bill-room-schemas.ts` (receipt, items,
  claims, participants, guests, guestClaims, shares), registered in `src/schemas.ts`; `src/schemas.test.ts` runs the
  SDK schema-lint on every collection. tsc clean, lint 11/11, `deepspace test run` 8/8.
  Deviations from the docs, found in the SDK docs: guests moved to their own `guests` collection (userBound would stamp
  the host's id on a guest participant row); items create false + host-only `addItem` (else a non-host could inject
  lines the host can't delete); `joinBill` needed because members can't write `bills`. Docs updated to match.
- Verified / changed: 
