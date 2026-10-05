# SplitSnap — writeup

**Live:** https://splitsnap.app.space · **Code:** https://github.com/biddybibo/SplitSnap · **Demo video:** **[YOU: add the link, or delete this item]**

**Main tradeoff:** everyone signs in, which adds a step at the table, so that every claim is tied to a verified
person and the server can refuse forged ones. Host-added guests cover anyone who won't sign in.

## What I built

Splitting a restaurant bill usually means one person squinting at a receipt, a calculator, and a group chat full
of "what did you have?". SplitSnap turns it into one shared, live bill: the host photographs the receipt, AI reads
the line items, everyone opens a link on their own phone and taps what they had, and once the host locks it each
person gets an exact amount and a pay link with the amount already filled in.

The core path works on the deployed URL: scan → check what the AI read → share (link or QR) → claim live,
including shared items → lock → settle with Venmo / Cash App / PayPal links and "I paid".

**Cut on purpose, to finish in five days:** moving money in the app, multiple currencies, receipt history and
spending analytics, and a native app.

## DeepSpace: what I used, what I skipped, what I built myself

**Integrations used**
- **Claude through the AI proxy** reads the receipt photo into items, subtotal, fees, tax, tip and total. No API key
  in the repo; capped at 10 scans per person per day because the app owner pays.
- **Email (`email/send`)** lets the host remind friends who haven't paid. Addresses are read on the server and never
  sent to anyone's phone; at most one email per person every 6 hours.

**Platform primitives the app is built on**
- **Sign-in** (Google / GitHub): every claim belongs to a verified person — the main tradeoff above.
- **Real-time rooms with schema permissions:** each bill is its own room, so every phone sees claims instantly.
  The rules are declared on the collections ("stamp the real user", "one claim per person per item", "only the
  host edits prices") rather than written as custom checks.
- **Presence:** the claim screen shows who's at the table right now.
- **Private file storage:** the receipt photo is stored in the host's own private space.
- **Server actions:** anything paid or trusted runs on the server — reading the receipt, locking, host-only
  changes, reminders.

**Skipped, and why they wouldn't improve the app**
- **Payments (Stripe):** holding friends' money means custody, licensing and fraud handling. Prefilled
  Venmo / Cash App / PayPal links settle the bill without SplitSnap touching money.
- **SMS:** the platform has no SMS provider and server texting needs carrier registration. A text from the host's
  own phone (a prefilled `sms:` link) also lands better than a bot.
- **Search:** a bill has 5–20 lines; there is nothing to search.
- **Video / voice (LiveKit):** everyone is already at the same table.
- **Maps / location:** the restaurant's name is on the receipt; asking for location adds a permission prompt for
  nothing.
- **Scheduled jobs (a daily reminder):** an automatic daily nag felt worse than the host choosing when to nudge.

**Where I built my own, and why**
- **`createActionTools(…, roomId)`** (`src/server/action-tools.ts`): the scaffold's server-action tools could only
  reach the app's main room, and each bill lives in its own room.
- **`GET /api/public/bills/:id`**: a friend who taps the link should see the bill before signing in. It returns
  only what the preview shows (no ids, emails, amounts or pay handles) and answers from a 5-second cache.
- **`requireHost()`** (`src/server/bill-access.ts`): one check, used by all nine host-only actions, that the caller
  is the bill's host (read from the bill, never from the request) and that the bill isn't locked.

## Decisions that shaped it

| Decision | Why |
|---|---|
| **SplitSnap never moves money.** | See "Payments" above. Trade-off: "I paid" is self-reported. |
| **Everyone signs in; the host can add guests.** | The main tradeoff. I rejected anonymous claiming (one person could become five in private tabs, and seats are lost when a browser clears) and phone-number sign-up (sign-in is Google/GitHub only, and SMS needs carrier registration). |
| **The printed total is the bill, and a bill can't be locked until the lines add up to it.** | A misread line should never silently change what everyone owes. |
| **Make the AI's work checkable.** It also reads the printed subtotal, so a three-way check says *where* a mismatch is; it flags lines it couldn't read; the host sees the photo beside the numbers. | My first idea was to check the total against the host's bank charge. I dropped it (bank-data consent, and the tipped charge often posts days later) once I saw the real worry was the AI misreading the total, which this solves. |
| **"Share anyway — I'll cover the difference."** | When nobody can find the missing $2.10, the host absorbs it on their own share. |
| **Split "by how many"** (2 of the 3 tacos). | The agent recommended deferring it; I chose to build it, because shared plates are where even splits feel unfair. |
| **The host can assign items for others.** | One host-only server action; everyone else can still only claim for themselves. |
| **Card roulette, with no gambling.** A lighthearted "who covers the bill": opt in on your own phone, one server-side draw, no re-rolls. | Stakes beyond the bill would be gambling, which is not the product. |

## What the agent did, and what I did

I built SplitSnap with Claude Code as the coding agent, one slice at a time under rules I set in `CLAUDE.md`
(docs as the source of truth, no secrets, permissions enforced on the server). `AGENT_LOG.md` records every
session.

**The agent:** wrote most of the code — schemas, server actions, screens and `computeShares` (which I'd planned to
write myself, then handed over to focus on product and testing); drafted the five "gap" screens (join preview,
scanning, doesn't add up, host view, split one item) and the invite sheet design in a planning session; wrote and
ran the unit tests and the live security script; found the working email integration and sender; drafted the
README and this writeup.

**I directed and decided:** the idea and scope; the screen mockups (Start, Review, Claim, Settle) and the logo; the
three expansion directions and the no-gambling line; which gap screens to build. Where I chose differently from the
agent: building "by how many"; cutting the "Nobody claimed" section as redundant; unpinning the bottom buttons; our
own invite sheet instead of the phone's share sheet; dropping the bank check and phone sign-up.

**I verified myself:**
- Real paper receipts. The first sample receipt's own math was wrong (not the AI's read), which moved testing to
  real receipts — and a hotel receipt then exposed a service charge read as a food item, which led to a new line
  type.
- The full two-phone flow on the live site.
- A friend's white screen on a shared link, which exposed a real bug: sign-in returned to Home instead of the bill.
- Blank pages that I reproduced on my own laptop, which pinned them on tabs left open across deploys and led to a
  reload-once safety net.
- The Preview button hiding behind Safari's toolbar, and the host's settle page missing pay buttons.
- **[YOU: only if you did it — e.g. "I checked `computeShares` by hand on a real receipt: …". Otherwise delete.]**

**[YOU: one or two sentences in your own words — what you'd do differently working with an agent, or what
surprised you.]**

## Proving it's safe

Permissions live on the server, not in the UI. At my request the agent wrote a script that attacks the live site
the way a script would — opening its own connection to a bill's room to send forged writes, and calling server
actions directly, as a friend and as the host. **27 of 27 attacks were refused**: forging a claim as someone else,
claiming twice, a friend changing prices or adding a fake discount, writing your own final share, locking by hand
(even as the host), marking someone else paid, calling host-only actions, rigging card roulette, reading the
AI-usage table, and checking the public preview for leaks. The table with the server's exact answers is in
`tests/break-it.md`; rerun with `node tests/break-it.run.mjs`.

The money math is one pure function used both in the live preview and on the server at lock. Its tests include a
2,000-bill randomized check that shares always add up to the bill exactly, and a live end-to-end run (a guest
included) matched the expected amounts to the cent.

## Building on DeepSpace

What made it fast: live sync with no extra code; security rules declared per collection instead of hand-written
policies; AI with no API key to manage; auth, file storage, server actions and one-command deploys in one package;
and logs I could read from the terminal, which is how the sign-in redirect bug was found.

Where it cost time: docs that disagreed on one detail (whether a user-stamped field re-stamps on update — that path
is written defensively) and named an email integration that doesn't exist (`resend/send-email`; the working one is
`email/send`); scaffold limits to work around (server actions reached only the main room; sign-in always returned
to `/home`); and deploys deleting old files, which blanked tabs left open.

## How it would scale

Each bill already has its own room, so tables scale out independently. What would change first:

1. **The app room holds every user's bill list and scan counter.** Move each user's list and counter into their own
   small room, written by the server actions.
2. **AI spend has only a per-account cap**, and accounts are free. Add an app-wide daily budget and per-IP limits.
3. **Rate limits on server actions** generally.
4. **The receipt photo is uploaded twice** (to storage and inside the AI request); the action could read it from
   storage instead.

## What I'd do next

- A "claim your spot" link that turns a guest into a signed-in friend.
- Work meals: apply a company policy ("food covered up to $X a head") after everyone claims.
- Invite tracking ("1 link · not opened").

## Known limitations

- "I paid" is self-reported; the app can't see Venmo / Cash App / PayPal transactions.
- Sign-in needs a Google or GitHub account; guests cover everyone else.
- The newest screens (guests, "by how many" from a friend's side) were exercised more by automated runs than by
  people at a real table.
- One friend's phone couldn't reach the site for a while despite the server answering every request; it looked
  network-side, but I couldn't confirm the cause.
