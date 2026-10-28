# intent.md — Pareto prototype

| | |
|---|---|
| Captured | 2026-10-28 |
| Status | Draft |
| Stage | 1 · Plan |
| Feeds | [spec.md](spec.md) → [plan.md](plan.md) |

## Problem

A small operator can keep a handful of future bills in notes, and then cannot answer three questions once there are more of them: how much cash is still spoken for, on which day each account goes short, and which of their own accounts can fund the shortfall in time. A tax ledger records what already happened. It does not, by itself, show an unbilled contract milestone, and it does not pick a rail.

## Proposed outcome

One program with a balanced journal, an append-only list of future obligations, a runway for each cash account, and a route that moves the full shortfall along one path. The path is chosen from the deadline, the rail, the fee, and the time. The same numbers are available from the command line, from a chat skill, and from a page in the browser.

## Affected users and systems

- **Users:** The owner, moving money between their own accounts to pay a bill they already intend to pay.
- **Systems:** A SQLite file on the owner's machine. A static page with no account and no server. No bank connection and no payment initiation.

## Constraints and principles

- A journal entry is one business event. Its lines sum to zero. A compound entry stays one entry.
- A signed contract is an obligation before it is an invoice. Unbilled milestones reduce the runway and do not sit in accounts payable until they are billed.
- History is appended. A date slip or a price change is a new event.
- A route moves the full amount once. A rail that will not accept that amount is skipped.
- Splitting one payment into sub-threshold transfers is out of scope. So is scheduling transfers to avoid a suspicious-activity report or a structuring control. The source conversation marks those replies as not captured, and this product does not invent them.
- The page, the skill, and the command line call one library.

## Open questions (carried into spec.md)

1. Which choices that the conversation leaves open should wait for a later version?
2. How should a dispatched obligation become a journal entry?
3. Which clock and which holiday set does the first router use?

## Original prompt (verbatim)

> Bootstrap https://github.com/nikolaybotev/pareto and ship an initial prototype. Do not stop for product questions. Defer open choices to a follow-up version and record them in the PR.
>
> Intent: the 20-turn Gemini thread captured at /cursor/stores/self/docs/gemini-share.md (cloud path; on your VM it may be the same path if the Project store is mounted, otherwise read it from the coordinator store the path names). Treat that conversation as the product intent: double-entry ledger in SQL, obligations/cash runway, and a legitimate multi-account liquidity router (deadlines, rails, fees, time). Do NOT implement the omitted parts: splitting one payment into sub-threshold transfers, or scheduling transfers to avoid SAR or structuring controls. If the capture marks a section as not captured, leave that behavior out.
>
> Scaffolding must match https://github.com/nikolaybotev/compound exactly in structure:
> 1. environment.json that pulls the local skills, including sdlc
> 2. the same license
> 3. the same app architecture: .js backend library, CLI front-end, skill front-end, SPA front-end
>
> Inspect compound (clone or GitHub) and copy that scaffolding pattern, then adapt names to pareto. If compound is private and you cannot read it, say so immediately in your report and stop rather than inventing a different architecture.
>
> Then spec, plan, and build a small working prototype of the app on top of that scaffold. Open a pull request. In the PR body, state what the prototype does, what you deferred, and how to run it.
>
> Return the PR URL, what you mirrored from compound, and any blocker.

## Source transcript (verbatim)

The Gemini share captured on 2026-10-28 is stored verbatim, unmodified, in [source-transcript.md](source-transcript.md). Two replies and one subsection of that capture are markers that the operational splitting text was left out. Those markers are part of the transcript. They are not a specification.
