# SplitSnap — writeup

**Live:** https://splitsnap.app.space · **Code:** [repo link] · **Demo video:** [link, if any]

## What I built

Splitting a restaurant bill usually means one person squinting at a receipt, a calculator, and a group chat full
of "what did you have?". SplitSnap turns it into one shared, live bill: the host photographs the receipt, AI reads
the line items, everyone opens a link on their own phone and taps what they had, and once the host locks it each
person gets an exact amount and a pay link with the amount already filled in.

The full path works on the deployed URL: scan → check what the AI read → share (link or QR) → claim live, including
shared items and "by how many" splits → lock → settle with Venmo / Cash App / PayPal links and "I paid".

## Decisions that shaped it

| Decision | Why |
|---|---|
| **SplitSnap never moves money.** Pay buttons open Venmo / Cash App / PayPal with the amount filled in. | Holding friends' money means custody, licensing and compliance. Deep links do the job. Trade-off: "I paid" is self-reported. |
| **Everyone signs in, and the host can add guests** who won't. | Every claim is tied to a verified person, which is what makes "you can't claim for someone else" hold on the server. Guests cover the friend without an account. I rejected anonymous claiming (one person could become five in private tabs, and seats get lost when a browser clears) and phone-number sign-up (the platform's sign-in is Google/GitHub only, and SMS needs carrier registration). |
| **The printed total is the bill, and a bill can't be locked until the lines add up to it.** | A misread line should never silently change what everyone owes. |
| **Make the AI's work checkable.** It also reads the printed subtotal, so a three-way check says *where* a mismatch is (a line vs. the total/tax); it flags lines it couldn't read; the host sees the photo beside the numbers. | My original instinct was to verify the total against the host's bank charge. I dropped that (bank-data consent and compliance, and the tipped charge often posts days later) once I realised the real worry was the AI misreading the total — which this solves without touching anyone's bank. |
| **"Share anyway — I'll cover the difference."** | Sometimes nobody can find the missing $2.10. The host can absorb it on their own share so friends still pay only for what's on the lines. |
| **Split "by how many"** (2 of the 3 tacos). | The agent recommended deferring it as out of scope; I chose to build it, because shared plates are exactly where even splits feel unfair. |
| **A limited public preview** before sign-in. | A friend tapping a link should see who invited them, the restaurant and total, and who's already picking — not a bare sign-in wall. It shows no ids, emails, per-person amounts or pay handles. |
| **The host can assign items for others** ("who had the Jarritos?"). | Through one host-only server action; everyone else can still only claim for themselves. |
| **No gambling.** Card roulette is a lighthearted pick of who covers the bill: everyone opts in on their own phone, the server draws once with secure randomness, and nobody can re-roll or rig it. | Wagering beyond the bill is regulated gambling and not the product. |
| **Reminders by text from the host's phone, and by email from SplitSnap.** | A nudge from a friend in the group chat lands better than an automated message, needs no SMS provider (which would also need carrier registration) and stores no phone numbers. Email covers everyone else: host-only, read server-side, never shown to anyone, at most once per person every 6 hours. |
| **Catch duplicate scans without wasting one.** | The AI has to read a receipt before it can recognise it, so the bill is always created and the host chooses "open the earlier one" (the copy is deleted) or "keep both". Matching uses the printed check number and date first, then date-time and total, then the line prices. |

## Proving it's safe

Permissions live in the server, not the UI. I tested them the way an attacker would: a script that opens its own
connection to a bill's room and sends forged writes, and calls server actions directly, as a friend and as the
host, on the live site. **27 of 27 attacks were refused** — forging a claim as someone else, claiming twice, a
friend changing prices or adding a fake discount, writing your own final share, locking by hand (even as the host),
marking someone else paid, calling host-only actions, rigging card roulette, reading the AI-usage table, and
checking the public preview for leaks. The full table with the server's exact answers is in `tests/break-it.md`.

The money math is one pure function used both in the live preview and on the server at lock. Its tests include a
2,000-bill randomized check that shares always add up to the bill exactly, and an end-to-end run on the live site
(a guest included) matched my hand calculation to the cent.

## How I worked with the agent

I built SplitSnap with Claude Code as the coding agent, working in small slices that I reviewed one at a time
(CLAUDE.md sets the rules: one slice at a time, docs as the source of truth, no secrets, server-side permissions).
`AGENT_LOG.md` records every session; the short version:

- **My direction and design:** the product and plan (from a planning session with the agent), my screen mockups
  and the five "gap" screens, my logo, the invite sheet, and the expansion ideas.
- **Calls where I chose differently from the agent:** building "by how many"; cutting the "Nobody claimed" section
  as redundant; unpinning the bottom buttons; replacing the phone's share sheet with our own.
- **Things I caught:** a sample receipt whose own math was wrong; a friend's white screen that exposed a real
  sign-in redirect bug; the blank page I reproduced on my own laptop (tabs left open across deploys → a reload-once
  safety net); the Preview button hiding behind Safari's toolbar; missing pay buttons for the host.
- **What the agent wrote:** most of the code, including `computeShares`, which I'd planned to write myself and then
  asked it to write so I could focus on product and testing. [Once done: "I checked its numbers by hand on a real
  receipt (e.g. Westin: Roy $36.25, Maya $13.05)."]
- **Bugs the testing caught** (worth more than the ones that never happened): a service charge read as a food
  item, so the check failed on a correct receipt; the invite sheet not opening on the host's first share (a live
  update raced a page change); a CSS rule that silently undid the iPhone layout fix; and a bug in one of our own
  security tests.

[One or two sentences in your own words: what you'd do differently working with an agent, or what surprised you.]

## Building on DeepSpace

What made it fast: live sync with no extra code; security rules declared per collection ("stamp the real user",
"one claim per person per item", "only the host edits") instead of hand-written policies; AI with no API key to
manage; auth, file storage, server actions and one-command deploys in one package; and logs I could read from the
terminal, which is how the sign-in redirect bug was found.

Where it cost time: docs that disagreed on one detail (whether a user-stamped field re-stamps on update — I wrote
that path defensively); scaffold assumptions to work around (server actions could only reach the main room,
sign-in always returned to `/home`); deploys deleting old files, which blanked tabs left open; and sign-in limited
to Google/GitHub.

## How it would scale

Each bill already has its own room, so tables scale out independently. What would need to change first:

1. **The app room holds every user's bill list and scan counter.** At scale it becomes the bottleneck; move each
   user's list and counter into their own small room, written by the server actions.
2. **AI spend has only a per-account cap**, and accounts are free. Add an app-wide daily budget and per-IP limits.
3. **Rate limits on server actions** generally.
4. **The receipt photo is uploaded twice** (to storage and inside the AI request); the action could read it from
   storage instead.

Already done for scale: the public preview answers from a short cache instead of hitting the room on every poll,
the join screen only polls while visible, and the QR library loads only when the invite sheet opens.

## What's next

- **Work meals — the most original direction.** Snap the receipt, everyone claims, then apply the company's policy
  ("food covered up to $X a head, alcohol is personal") and send the business share to the expense tool. Expense
  tools don't split items across people and consumer split apps don't know company policy; a finance team is a
  buyer with a budget.
- **Pay at the table, for restaurants** — the QR on the receipt, diners pay the restaurant directly. The biggest
  opportunity, but it needs payment processing and point-of-sale integrations.
- **Smaller:** a "claim your spot" link that turns a guest into a signed-in friend, a daily reminder for bills
  still unpaid after a day, and invite tracking ("1 link · not opened").

## Known limitations

- "I paid" is self-reported; the app can't see Venmo / Cash App / PayPal transactions.
- Sign-in needs a Google or GitHub account; guests cover everyone else.
- The newest screens (guests, "by how many" from a friend's side) were exercised more by automated runs than by
  people at a real table.
- One friend's phone couldn't reach the site for a while despite the server answering every request; it looked
  network-side, but I couldn't confirm the cause.
- Bill splitting is a crowded category; SplitSnap's edge is live claiming, checkable AI and exact settlement, not
  the idea itself.
