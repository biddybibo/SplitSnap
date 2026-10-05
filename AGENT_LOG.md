# Agent log

How SplitSnap was built with an AI coding agent (Claude Code). Each entry leads with my direction, decisions and
catches, then what the agent built. Where I took the agent's recommendation it says so; where I overrode it, it
says that too. **Verified** lines are my own notes from testing.

## Decisions at a glance

| Decision | Where it came from | My call |
|---|---|---|
| Build SplitSnap; web app, mobile-first | Planning session | Chose it over the other ideas |
| Guests: friends sign in themselves **and** the host can add people who won't | **My proposal** (two scenarios + a future "claim your spot" link) | Chose host-only actions (Option C) |
| What's the bill when lines and total disagree | Agent recommended printed total + reconcile-before-lock | Agreed |
| Verify the total against the host's bank charge | **My idea** | Dropped after weighing consent/compliance and delayed tip posting; my real concern (the AI misreading the total) became the three-way check, photo beside numbers, editable total and a manual "amount charged" field |
| Duplicate receipts | **I raised it** and proposed matching on the printed check number / timestamp | Capture the fields now, matching later |
| Phone-number sign-up with a code | **My idea** | Dropped: the platform's sign-in is Google/GitHub only and SMS needs carrier registration; guests cover it |
| Let people claim without an account (from the QR code) | **I raised it** | Kept sign-in + host-added guests after the trade-offs |
| Visual design | **My mockups** (Start, Review, Claim, Settle) | Replace the agent's interim theme with mine; keep the reconcile extras in a collapsible section; pay handles on the bill, remembered for next time |
| Invite flow | **My design** (own invite sheet, QR "scan at the table") | Replace the OS share sheet |
| Logo | **My logo files**, then I asked for the receipt lines in the mark | Implemented as given |
| `computeShares` | Originally mine to write | Asked the agent to write it; I review and verify it |
| Expansion directions | **My three scenarios**: pay at the table for restaurants, policy-aware work meals, card roulette | Restaurants and full work-meal product → writeup; roulette only as a lighthearted "who covers the bill" game — **I drew the no-gambling line** |
| Five "gap" screens | **My design boards** (join preview, scanning, doesn't add up, host view, split one item) | Built all five |
| Host assigns items for others | Agent recommended a host-only action | Agreed |
| Split one item "by how many" | Agent recommended deferring it (out of scope) | **Overrode: build it** |
| Public preview before sign-in | Agent recommended a limited read-only preview | Agreed |
| "Share anyway" when it doesn't add up | Agent recommended the host absorbs the gap | Agreed |
| "Nobody claimed" section on the host view | Built from my board | **I moved it, then cut it** as redundant with "Nobody yet" on each item |
| Pinned bottom buttons | Agent pinned them | **I asked to unpin them** (they hid behind Safari's toolbar) |

## Things I caught

- **The first test receipt's own math was wrong**, not the AI's read, which steered testing to real paper receipts.
- **"Share with the table" never lit up.** It was intentionally disabled until sharing existed; I pushed to build
  share/join early.
- **A friend's phone showed a white screen on the shared link.** Investigating it exposed a real bug (sign-in
  returned to Home instead of the bill) and led to the branded loading screen.
- **I reproduced the blank page on my own laptop** with a second Chrome profile, which pinned it on tabs left open
  across deploys → the reload-once safety net.
- **The Preview button disappeared behind Safari's toolbar** when scrolling → unpinned, sized to the visible screen.
- **The locked page had no Venmo / Cash App / PayPal buttons for me** (by design for the host) → host now sees a
  preview of friends' buttons and can fix handles after locking.
- **Friends couldn't tap items yet**, and the invite button needed to be ours, not the phone's.

---

## 2026-10-01 — Planning
- **Direction:** pick a project for the DeepSpace exercise; plan the architecture; mock the screens.
- **Decided:** SplitSnap over the other ideas; web app, mobile-first.
- **Agent built (planning session):** PLAN.md, CLAUDE.md, first four phone mockups.
- **Verified:** _[your notes]_

## 2026-10-01 — Scaffold + parse spike
- **Direction:** a throwaway signed-in action: photo → Claude → JSON, plus a bare test page.
- **Agent built:** `parseReceipt` spike and a `/spike` page; noted `generateObject` is deprecated in ai@7.
- **Tested on real receipts:**
  - #1 DINEFINE (sample image, 4.3 s): read faithfully, but the receipt's own numbers are $12.00 apart — **I
    spotted that the receipt itself was wrong**, so we switched to real paper receipts.
  - #2 The Tack Room (real, 6.3 s): 7 items, qty 2 read correctly as a line total, adds up exactly. Tip 0 (pre-tip
    bill) → the review screen needs a host-editable tip.
- **Verified:** _[your notes]_

## 2026-10-01 — Design decisions: guests, reconciling totals
- **Direction / decided:**
  - Guests: **I proposed two paths** (self sign-in, and host adds a guest; later a link to claim their spot) →
    host-only actions (Option C).
  - The printed total is the bill; locking requires the numbers to reconcile (agent's recommendation).
  - **I proposed verifying against the bank charge**; after the trade-offs I clarified the real worry was the AI
    misreading the total → three-way check with the subtotal, photo beside the numbers, editable total, optional
    "amount charged to card".
- **Agent built:** PLAN.md / CLAUDE.md updates for all of the above.
- **Verified:** _[your notes]_

## 2026-10-02 — Schemas + permissions
- **Direction:** every collection and permission rule from CLAUDE.md.
- **Agent built:** all schemas plus a schema-lint test. Three changes forced by the SDK docs: guests in their own
  collection; members can't create items (host-only `addItem`); a `joinBill` action.
- **Verified:** _[your notes — did you review each permission block against PLAN.md?]_

## 2026-10-02 — Real `parseReceipt`
- **Direction:** production parse; switch to `generateText` + `Output.object`.
- **Agent built:** 10-scans/day cap, three-way check, writes into each bill's own room.
- **Tested:** receipt #3 Westin / Lona exposed a real bug — the 18% service charge was read as an item, so both
  checks falsely failed → new `fee` line type; re-test passed.
- **Verified:** _[your notes]_

## 2026-10-02 — Start screen, review screen
- **Direction:** upload/scan screen; review screen. Asked about duplicate receipts → **I proposed using the check
  number / timestamp**; we capture both now.
- **Agent built:** start screen, review screen (inline edits, mismatch banner, tip, amount charged), `addItem`,
  shared reconcile math.
- **Verified:** _[your notes]_

## 2026-10-02 — Adopting my design
- **Direction:** compared the built screens with **my mockups**; switch to my look; keep the reconcile extras
  collapsible; pay handles on the bill, remembered for the next one.
- **Agent built:** my palette and type, Start and Review rebuilt to my layouts, scans-left counter, pay-handle card.
- **Verified:** _[your notes]_

## 2026-10-02 — Share, join, and the white-screen hunt
- **Direction:** **"Share with the table" never lit up** → build share/join early.
- **Caught:** a friend's phone stuck on a white screen. Logs showed requests answered, plus a real bug: sign-in
  returned to Home instead of the bill → fixed, and a branded loading screen replaced the blank one.
- **Agent built:** `joinBill`, the join card, the share button rules.
- **Verified:** _[your notes]_

## 2026-10-02 — Claim screen, logo, invite sheet
- **Direction:** **friends couldn't tap items yet** → claim screen from my mockup; host gets the same screen plus
  editing. **My logo files** (then **the receipt lines in the mark**). **My Invite sheet design** replacing the
  phone's share sheet; confirmed the QR should be real.
- **Caught:** the Preview button **hid behind Safari's toolbar** → unpinned; blank pages reproduced **on my laptop**
  → diagnosed as tabs open across deploys.
- **Agent built:** claim screen, logo integration, invite sheet with a scannable QR (verified by decoding it).
- **Verified:** _[your notes]_

## 2026-10-02 — Scope calls
- **Phone sign-up:** **my idea**; dropped (platform sign-in is Google/GitHub only; SMS carrier registration).
- **Claiming without an account:** **I raised it**; kept sign-in + host-added guests.
- **Verified:** _[your notes]_

## 2026-10-02 — `computeShares`, lock and settle
- **Direction:** asked the agent to write `computeShares` (originally mine; CLAUDE.md updated to record it). Lock
  and settle next. **My three expansion scenarios**; **I set the no-gambling line** for card roulette.
- **Agent built:** `computeShares` (exact math, rounding remainder to the host, 2,000-bill randomized test),
  `lockBill`, Settle with prefilled pay links and "I paid".
- **Verified:** _[your notes — check the Westin split by hand: Roy $36.25, Maya $13.05]_

## 2026-10-02 — My five "gap" boards
- **Direction:** **my boards** for the join preview, scanning, doesn't add up, host view, and split one item.
- **Decided:** host-only assignment (agreed); **build "by how many" against the agent's advice to defer it**;
  limited public preview (agreed); "share anyway" with the host absorbing the gap (agreed).
- **Then:** moved "Nobody claimed" under my own items, **then cut it** as redundant.
- **Agent built:** all five, including AI flags on hard-to-read lines and per-person counts in the split math.
- **Verified:** _[your notes]_

## 2026-10-04 — Safety net, settle fixes, testing
- **Caught:** **no pay buttons on the locked page for me** → host preview of friends' buttons + editable handles.
- **Approved:** the reload-once safety net (the agent verified it in a scripted browser: recovers in ~1 s, never
  loops).
- **Testing:** **I ran the full two-phone test**; asked the agent to run the break-it tests. Result: **21 / 21 attacks
  refused** on the live site (table in `tests/break-it.md`), plus a real bug found and fixed (the invite sheet
  didn't open on the first share).
- **Verified:** _[your two-phone test notes]_

## 2026-10-04 — Guests
- **Direction:** host-added guests, as I'd asked for on day one.
- **Agent built:** add / remove guests, pick for a guest from the split sheet, mark a guest paid.
- **Tested live:** guests + lock end to end matched hand math (Felix $6.54, Gina $7.63, Hana $16.35 = $30.52).
- **Verified:** _[your notes]_
