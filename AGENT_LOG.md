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

## 2026-10-02 — Slice 2: real parseReceipt
- Asked: production parseReceipt; switch to generateText + Output.object.
- Agent produced: `src/server/action-tools.ts` (tools factory moved out of action-routes.ts, now takes a room id);
  `parseReceipt` rewritten: input checks, 10/day cap via `usage` (counted before the AI call), subtotal + three-way
  check (`checkReceipt`, reports lines vs total separately and `offByCents`), writes `receipt` + `items` (tax/tip as
  kind lines) to `bill:<id>` then the `bills` index row; returns `{ billId, check }`. Unit tests for the check using
  receipts #1 and #2. Deleted the `/spike` page. tsc/lint clean, 16/16 unit tests.
  Not yet run end to end (no test accounts; needs the slice 3 upload screen).
- Verified / changed: 
- E2E on deployed /spike v2 (receipt #3 Westin / Lona, 6.2 s): bill-room writes confirmed by read-back; AI read
  correctly. Bug found: 18% service charge saved as an item, so both checks falsely failed. Fix: `fees[]` in the
  AI schema, `fee` item kind (split by subtotal like tax), check = subtotal + fees + tax + tip. Test case #3 added.
  Re-test after fix (Westin, 3.4 s): service charge saved as `fee`; both checks true, offByCents 0. Slice 2 verified e2e.

## 2026-10-02 — Slice 3a: start screen + theme (checkpoint)
- Asked: slice 3, stopping after the start screen for a phone check.
- Agent produced: `/home` start screen (snap / upload; signed-out → sign in; preview + "Reading the receipt…" via
  `useAsyncResource` with retry 0 since each attempt costs a parse; error + Try again / Different photo; navigates to
  the bill) and "Your bills" list; photo saved with `useR2Files().uploadBase64` (self scope), non-fatal if it fails;
  `/b/<billId>` stub that reads the bill room; helpers `src/lib/{image,actions,money}.ts`; "receipt" theme (warm
  white, ink, money green) as default; landing + SEO copy; APP_NAME → "SplitSnap"; deleted `/spike`.
  tsc/lint clean, 17/17 unit, 8/8 runtime; checked 390px screenshots of landing and signed-out home.
- Verified / changed: 

## 2026-10-02 — Slice 3b: review screen
- Asked: review screen at /b/<billId>; also capture check number + printed date for later duplicate detection.
- Agent produced: `ReviewScreen` (photo via private `readFile`, inline name/price edits via `useMutations`, delete,
  "Add a missed line", fees/tax, editable printed subtotal/total, mismatch banner pointing at lines vs total with an
  adjustment button, tip 15/18/20/none/custom, amount charged → tip, bill total; read-only for non-hosts);
  `addItem` host-only action; `src/lib/reconcile.ts` (shared with lockBill) + `parseDollars`; receipt/bills gain
  `receiptNumber`, `printedAt`, `printedTipCents`. Printed-tip rule: inside printed total; added tip on top.
  tsc/lint clean, 39/39 unit, 8/8 runtime. Not yet checked signed-in on a phone.
- Verified / changed: 

## 2026-10-02 — Slice 3c: adopt the design mockup
- Asked: compare the built screens with my mockup (Start / Review / Claim / Settle); switch to its look; keep the
  reconcile extras in a collapsible section; host pay handles on the bill, remembered for the next one.
- Agent produced: `splitsnap` theme (mockup palette + Space Grotesk / IBM Plex Sans / Plex Mono); Start rebuilt to
  the mockup (dashed scan card, "N of 10 scans left today" via new `scansLeft` action, bill rows with date · people and
  Open / Locked / Settle up pills); Review rebuilt ("Check what we read", summary card with green "adds up" / orange
  "off by" line, boxed prices, totals card with 15/18/20/22% tip chips, collapsible "Check against the receipt" with
  fees/tax, printed numbers, amount charged and adjustment, "How friends pay you" card, pinned Share button disabled
  until Saturday); receipt gains payVenmo/payCashApp/payPaypal, copied by parseReceipt from the host's last bill;
  `cleanHandle` + tests. Tip chips moved under the tip row (one line didn't fit 390px). Skipped "1 item left" on the
  bills list (needs every bill room). tsc/lint clean, 47/47 unit, 8/8 runtime; 390px screenshots of landing + home.
- Verified / changed: 

## 2026-10-02 — Slice 4a: share + join
- Asked: make "Share with the table" work; start Saturday's share/join slice early.
- Agent produced: `joinBill` action (participants row + participantIds, written as the host, retry-on-race); Share
  button enabled when the bill reconciles and has a pay handle (hint says what's missing), host auto-joins on first
  share, phone share sheet with clipboard fallback; Join card for signed-in friends (name prefilled, editable);
  "At the table" list with mockup avatar colors (`src/lib/people.ts`). Bill room now mounts participants + claims.
  tsc/lint clean, 47/47 unit, 8/8 runtime. Two-account test not yet run.
- Verified / changed: 
