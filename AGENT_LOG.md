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
- Friend's link test (Messages → Safari, "server stopped responding"): worker logs show every friend request
  answered `ok` in ms, plus iMessage preview fetches, so the hang was network-side on their phone (not fixable
  here). Logs did reveal a real bug: OAuth always returned to /home, stranding a friend who signed in from a bill
  link. Fix: `src/lib/returnTo.ts` remembers `/b/<uuid>` (only that shape; 10-min expiry) and /home sends them
  back; tests cover open-redirect attempts. Also replaced the blank auth-check screen with a branded "Opening…"
  screen that suggests Safari/Chrome or a connection check after 5 s. 55/55 unit, 8/8 runtime.

## 2026-10-02 — Slice 4b: claim screen (from the mockup)
- Asked: the tap-what-you-had screen for guests and host, with Invite and "Preview the final split".
- Agent produced: `ClaimScreen` (mockup layout: header + Invite for everyone, Edit for host, avatar stack + live
  "N here · X still picking" via `usePresenceRoom('bill:<id>')`, tap-to-claim cards with claimant avatars,
  "Split N ways" / "Nobody yet", "you $x", sticky "Your share so far" + unclaimed warning + Preview button; Join card
  on top for friends not yet seated; claims via createConfirmed/removeConfirmed with per-item pending lock);
  `SplitPreview` (per-person item portions, fees/tax/tip total, unclaimed list); bill-page router (host reviews until
  first share, then everyone claims; `?edit=1`, `?view=split`); `src/lib/claims.ts` display math + tests;
  `src/lib/share.ts`. Did NOT write computeShares: totals show items only, "tax, fees & tip added at lock".
  tsc/lint clean, 58/58 unit, 8/8 runtime. Two-phone claim test pending.
- Verified / changed: 

## 2026-10-02 — Logo + icons
- Asked: implement my logo files (favicon.svg, logo-mark.svg, logo-mark-dark.svg, Logo.tsx).
- Agent produced: favicon.svg as the tab icon; 180px apple-touch-icon.png rendered from it (full-bleed; iMessage was
  requesting it and getting nothing); both marks in public/; `src/components/Logo.tsx` (as given, wordmark font
  switched to the `--font-display` token, same Space Grotesk with fallbacks) used in the nav, landing and the
  "Opening…" screen; theme-color meta. 390px screenshots checked. Also diagnosed the blank-screen reports: tabs
  holding a page from before a deploy request old asset hashes, which 404 → blank. Proposed an inline reload-once
  safety net in index.html (not built yet; awaiting OK).
- Verified / changed: 
- Bottom buttons hidden behind iOS Safari's toolbar: unpinned the Claim footer ("Your share so far" + Preview) and
  the Review "Share with the table" block so they sit at the end of the page; app shell now `h-dvh` (100vh on iOS
  includes the area under the toolbar) + `viewport-fit=cover` + safe-area bottom padding. Checked `h-dvh` actually
  wins in the built CSS (with `h-screen` alongside it, h-screen won). Logo: added the white receipt lines from
  logo-mark.svg to `Logo.tsx` (ink lines on the white strip in the dark variant).

## 2026-10-02 — Invite sheet (design board 3b)
- Asked: our own invite UI instead of the OS share sheet, per Invite.dc.html.
- Agent produced: `InviteSheet` bottom sheet: "Send a link" / "Scan at the table" tabs; link field + Copy (Copied
  state); Text (`sms:?&body=`), WhatsApp (`wa.me`), Email (`mailto:`), More (OS share sheet, or copy); editable
  "Message they'll get"; real QR via `qrcode@1.5.4` (MIT) at error-correction H with the logo in the centre —
  decoded with macOS Core Image to confirm it scans; "At the table" with Host / Here now / Joined. Opened from
  Invite on the claim screen and from the host's first Share (→ `?invite=1`). Left out "Add guest" (guests not
  built) and "1 link · Not opened" (needs invite tracking). Removed `src/lib/share.ts`. npm audit's one low finding
  is the pre-existing esbuild dev-server (Windows) issue, not qrcode.
- Verified / changed: 

## 2026-10-02 — computeShares (written by the agent at my request)
- Asked: write computeShares + tests for me (CLAUDE.md rule updated to record it; I review and verify).
- Agent produced: `src/lib/computeShares.ts` — exact BigInt fractions; item/discount split evenly among claimants;
  fee/tax/tip/adjustment each split by subtotal share of the whole food subtotal; non-hosts rounded to the nearest
  cent per category, host takes the remainder (reproduces PLAN's sample: Roy $33.39, Maya $26.28, Dev $15.30);
  unclaimed lines not assigned in previews; extras to host when the food subtotal ≤ 0; rejects non-integer cents.
  14 tests incl. a 2,000-bill randomized check (sums exactly; non-hosts within ½¢ per category). Mutation check:
  rounding down instead of nearest fails 2 tests. Wired into the claim panel breakdown and the split preview;
  removed the items-only helper. 71/71 unit, 8/8 runtime.
- Verified / changed: 

## 2026-10-02 — lockBill + Settle screen
- Asked: next core step (lock and settle); also scoped my three expansion ideas (card roulette = lighthearted only,
  no gambling; work-meal light; restaurants writeup-only) into PLAN.md.
- Agent produced: `lockBill` (host-only via bills.hostId; refuses if already locked, any item unclaimed, offBy ≠ 0
  or the card charge doesn't match; merges claims + guestClaims; computeShares server-side; refuses if shares ≠ bill
  total; writes shares keyed by person (idempotent), stamps receipt.lockedAt (not host-writable), marks bills
  locked). Host "Lock the bill" on the claim screen with a confirm dialog; locked bills route everyone to
  `SettleScreen` (mockup: "You owe Maya $X", breakdown, Venmo / Cash App / PayPal prefilled via `src/lib/payLinks.ts`,
  "I paid" toggle on own participants row, the table with Paid / Not paid yet). payLinks rejects unsafe handles
  (tests). Pay-link URL formats need a real-phone check. 75/75 unit, 8/8 runtime.
- Verified / changed: 

## 2026-10-02 — "Gaps" boards, part 1: scanning + doesn't add up
- Asked: build the 5 new boards; decisions: host-only assign, build "by how many", limited public preview,
  host absorbs the gap on "share anyway". Recorded in CLAUDE.md (uneven splits now in scope) + PLAN.md.
- Agent produced: `ScanningScreen` (dark, user's own photo with a sweeping scan line, steps driven by real progress:
  uploaded → found N items → adds up / doesn't → "Review N items"; reduced-motion respected; per-line outlines
  omitted since the AI returns no positions). AI marks uncertain lines (`flagged`, `flagNote`); flagged rows are
  highlighted with the note; editing the price clears it. Mismatch banner ("$X is missing" / "too much", green
  "Adds up now" after a fix), "Items add up to vs receipt subtotal", "Fix the $X first", "Share anyway, I'll cover
  the $X" (only when lines are short) → `hostAdjustment` line charged to the host alone (computeShares + reconcile
  + tests). 77/77 unit, 8/8 runtime.
- Verified / changed: 
- Part 2 — host view + split by how many: `assignItem` (host-only; targets must be seated; writes each claim *as*
  that person so userBound stamps them; replaces the line's claims; counts must cover qty or be absent; refuses
  when locked). `HostPanel` on the host's claim screen (Host badge, "You paid $X", progress bar, People with
  Picked N / Still picking / Hasn't picked yet, "Nobody claimed → Who had it?" chips incl. "Split with everyone",
  Undo). `SplitSheet` (Split evenly / By how many; host edits everyone via assignItem, others only their own row).
  claims.units (own-writable); computeShares splits by units when every claim on a line has one (tests incl. the
  randomized check); lockBill + lock button refuse partly assigned count lines; taps on count lines open the sheet.
  81/81 unit, 8/8 runtime.
- Part 3 — friend opens the link: unauthenticated `GET /api/public/bills/:id` (`src/server/public-routes.ts`;
  strict UUID; returns host first name + color index, restaurant, date, total, item count, first 4 items with
  claimer initials, who's picking — no ids, emails, per-person amounts, handles or photo; no-store). `JoinPreview`
  replaces the generic sign-in wall on /b/<id>: "Maya invited you to split", live "X and Y are picking" (8 s
  refresh), Continue with Google / GitHub straight back to the bill. 81/81 unit, 8/8 runtime.
- Host view tweak (my call): moved "Nobody claimed" under the host's own items, then removed it as redundant —
  each card already says "Nobody yet". Host assigns from the item's split sheet (same host-only assignItem);
  the progress card now says so.

## 2026-10-04 — Safety net, Settle fixes, break-it script
- Asked: OK'd the reload-once safety net and Settle fixes; asked for break-it console scripts.
- Agent produced: inline script in index.html (reload once if an /assets/ file fails to load or nothing renders
  in 10 s; sessionStorage marker = at most one reload; cleared after a good render). Settle: host sees
  "How friends pay you" with a preview of the friends' pay buttons and can add/edit handles after lock (amounts
  unchanged). `tests/break-it.md`: one paste-in console script that opens raw room sockets / calls actions as an
  attacker would and prints PASS/FAIL for 10 friend checks, 4 host checks, the usage table, and the public
  preview; table of what each proves. Script syntax-checked only (needs a signed-in browser to run).
- Verified / changed: 

## 2026-10-04 — Break-it tests run by the agent (I'd done the two-phone test myself)
- Asked: run the break-it tests for me.
- Agent produced: two @deepspace.test accounts (Hana host, Felix friend; random passwords piped to the CLI, kept
  in ~/.deepspace only) and `tests/break-it.run.mjs`: generates a receipt, Hana scans/handles/shares on the live
  site, Felix joins and claims, then the tests/break-it.md script runs as each. 18/18 PASS (table in
  tests/break-it.md). Found and fixed a real bug on the way: the host's first Share didn't open the invite sheet
  (the live "seated" update switched to the claim screen before `?invite=1` was added); claim screen now reacts to
  the param. Also fixed a bug in my own check 2.
- Verified / changed: 

## 2026-10-04 — Guests
- Asked: build host-added guests, then the writeup.
- Agent produced: `addGuest` / `removeGuest` / `setGuestPaid` (host-only; max 20; removing a guest deletes their
  picks first); `assignItem` accepts `guest:<id>` and writes `guestClaims` (with units); lockBill passes guest units.
  `useTable()` merges participants + guests and claims + guestClaims for every screen. Invite sheet: "No phone or
  won't sign in? Add guest" + Remove; guests labelled in the host panel, split sheet, preview, settle; host can
  "Mark paid" a guest on Settle. Break-it +3 guest checks. Live run: 21/21 PASS, and guests + lock end to end
  matched hand math (Felix $6.54, Gina $7.63, Hana $16.35 = $30.52).
- Verified / changed: 
