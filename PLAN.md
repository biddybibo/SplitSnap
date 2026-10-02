# SplitSnap — Build Plan

As of Oct 1, 2026 · Deadline Mon Oct 5, 8:59 PM PT (11:59 PM ET), target Monday afternoon.

## Scope

SplitSnap turns a photo of a receipt into a shared, live bill that everyone at the table claims from their own
phone, then hands each person an exact amount and a pay link.

**Core path (must work on the deployed URL):**
1. Host signs in, snaps or uploads a receipt.
2. AI extracts line items, tax, tip and total; host fixes anything wrong.
3. Host shares a link; friends sign in and tap the items they had, seeing each other's picks live.
4. Shared items split evenly among everyone who tapped them; tax and tip split in proportion to each subtotal.
5. Host locks the bill; everyone sees their final amount with Venmo / Cash App / PayPal links and can mark themselves paid.

**Stretch:** email nudges to unpaid people, a daily reminder job, a "who's still picking" indicator.

**Out of scope, on purpose:** moving money inside the app, multi-currency, item-level discounts beyond a negative
line, uneven splits of one item, receipt history and analytics, a native mobile app.

## Architecture

```
Phone browser (React + Vite)
  ├─ WebSocket ─────────────► App room   (bills index, AI usage caps)
  ├─ WebSocket ─────────────► Bill room  (items, claims, participants, shares) + presence
  └─ actions + file uploads ► Worker (Hono): parseReceipt, lockBill, nudgeUnpaid, /api/files proxy
                                 ├─ writes as the app (tools.*) ► Bill room
                                 └─ signed platform proxy ► Auth · R2 files · Claude (AI) · Resend + cron
```

Phones write claims straight to their bill's room; anything that costs money or must be trusted (AI parsing,
final totals, emails) goes through a server action.

## Data model

| Collection | Room | Key columns | Permissions (member) | Why |
| --- | --- | --- | --- | --- |
| `bills` | app | title, hostId, status, total, participantIds (json) | read `shared` via `collaboratorsField`; writes via server actions | "My bills" list; status |
| `items` | bill | name, qty, priceCents, kind (item/tax/tip/discount), hostId | read true; update `own` via `ownerField: hostId` (userBound) | Host corrects AI output |
| `claims` | bill | itemId, userId (userBound, immutable) | create true; update/delete `own`; `uniqueOn: [itemId, userId]` | One claim per person per item, enforced by the room |
| `participants` | bill | userId, displayName, paid (boolean), isGuest | create true; update `own` | Who's at the table; "I paid" |
| `shares` | bill | userId, subtotalCents, taxCents, tipCents, totalCents | read true; no member writes | Snapshot written by `lockBill` |
| `usage` | app | userId, day, parses | no member access | Per-user daily AI cap |

Money is integer cents. `computeShares(items, claims)` is one pure function shared by client preview and server
lock. Leftover pennies go to the host.

## Key flows

1. **Parse** (`parseReceipt`): client resizes to ~1600px JPEG, uploads via `useR2Files()` (private `self` scope),
   posts base64 to the action. Action checks sign-in + daily cap, calls Claude (`createDeepSpaceAI` +
   `generateObject` with a Zod schema), validates the sum against the total, writes `items`, sets status `review`.
2. **Review**: host edits names/prices inline via `useMutations('items')`; `ownerField` means only the host's edits land.
3. **Live claiming**: friends open `/b/<billId>`, sign in, join (`participants` row). Tapping creates/removes a
   `claims` row; every phone updates in milliseconds. `usePresenceRoom('bill:<id>')` shows who's still picking.
   Friends who won't sign in can be added as guests by the host, who taps for them.
4. **Lock and settle** (`lockBill`, host-only): runs `computeShares`, refuses if anything is unclaimed, writes
   `shares`, sets `locked`. Each person sees their total, prefilled pay links, and an "I paid" toggle.
5. **Reminders** (stretch): `nudgeUnpaid` emails unpaid participants via Resend; a daily cron does the same for
   bills locked >24h. Emails read server-side only.

## Integrations

| Capability | Role | Replaces |
| --- | --- | --- |
| Auth (Google/GitHub) | Every claim tied to a verified user | Own sessions / spoofable guests |
| Records + realtime rooms | Live sync of items, claims, participants | A WebSocket server |
| AI (Claude via `createDeepSpaceAI`) | Photo → structured line items | OCR service + parsing rules |
| R2 file storage | Keeps the receipt for review | S3 + signed URLs |
| Server actions | Trusted parse/lock/nudge with server-side math | Hand-rolled API routes |
| Resend (stretch) | Nudges unpaid friends | Email provider + keys |
| Cron (stretch) | Daily reminder for stale bills | External scheduler |

**Left out:** Stripe (holding friends' money means custody/KYC; deep links do the job), Exa/Tavily search (no
outside info needed), LiveKit (everyone's at one table), Google Calendar/Gmail OAuth (extra consent for no gain),
Yjs (short structured fields fit records better).

## Security and cost controls

- AI is owner-billed: sign-in required, 10 parses/user/day, ≤5 MB images, button disabled in flight.
- Claim forgery blocked by `userBound` + `immutable` userId and `uniqueOn`.
- Only the host edits items (`ownerField`); lock/nudge actions verify the caller is the host.
- Final amounts come from the server-written `shares` snapshot.
- Receipts in private `self` scope; emails never leave server actions; users directory stays `read: 'own'`.
- Bill ids are random; anyone with the link and an account can join.
- No secrets in the repo.

**Break-it tests (run on the deployed URL, record in writeup):** forge a claim for another user from the console,
edit an item as a non-host, call `lockBill` as a non-host.

## Day-by-day plan

| Day | Focus | Done when |
| --- | --- | --- |
| Thu Oct 1 (tonight) | Scaffold, install skill, first deploy; throwaway parse spike | A real receipt parses on the deployed app |
| Fri Oct 2 | Schemas + permissions; upload → parseReceipt → review screen | Host goes from photo to a correct item list |
| Sat Oct 3 | Join link, claims, presence; `computeShares` + tests by hand; 5 real receipts | Two phones claim live; shares sum to total |
| Sun Oct 4 | `lockBill`, pay links, I-paid toggle, break-it tests; stretch if green | Full core path works on the deployed URL |
| Mon Oct 5 | Polish, states, README + writeup from AGENT_LOG, final deploy, submit ~5 PM PT | Submitted |

If a day slips: cut nudges/cron first, then presence. Never cut break-it tests or the real-phone run.

## Working with the agent

**Agent does:** scaffold/wiring, schema files, screens and styling, first draft of the parse prompt + Zod schema,
Playwright scaffolding.

**I do or verify myself:**
- [ ] Write `computeShares` + unit tests (rounding, shared items, zero tip, discount lines, pennies sum to total)
- [ ] Review every permissions block and `userBound`/`uniqueOn` line against this plan
- [ ] Run the break-it tests on the deployed URL
- [ ] Run the core path on two real phones with two accounts
- [ ] Parse at least 5 real receipts and note failures
- [ ] Confirm no secrets in git history before making the repo public

**AGENT_LOG.md:** one line per session — asked for / agent produced / I changed or rejected, and why.

## Risks and day-one spikes

| Risk | Spike | Fallback |
| --- | --- | --- |
| Image input via `createDeepSpaceAI` may not work as expected | Throwaway action: photo in, JSON out | Vision model via `integration.post` (check schema with `deepspace integrations info`) |
| Uploads 401 locally until first deploy | Deploy right after scaffolding | Send base64 to the action, add R2 later |
| Friends must sign in with Google/GitHub (public email signup closed) | Time the join flow on a phone | Host-added guests |
| AI misreads long/crumpled receipts | Test 5 real receipts Saturday | Inline editing + "doesn't add up" warning |
| Rounding drift | Unit tests on `computeShares` | Leftover pennies to host |

## Mockups

Four phone screens (390×844): start a bill, check what the AI read, live claiming, locked and settle.
Sample bill: Taqueria Luna, 7 items, subtotal $58.00, tax $5.37, tip 20% $11.60, total $74.97.
Shares: Roy $33.39, Maya (host) $26.28, Dev $15.30.

Sources: https://docs.deep.space · /guides/external-apis · /guides/server-actions · /sdk-reference/worker/ai ·
/concepts/permissions · /concepts/data-model · /guides/file-uploads · /guides/authentication ·
/guides/presence-and-cursors · /guides/scheduled-jobs
