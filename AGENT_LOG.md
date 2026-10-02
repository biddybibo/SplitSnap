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
- Parse accuracy on real receipts: 
