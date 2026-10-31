# spec.md — Pareto prototype

| | |
|---|---|
| Derived from | [intent.md](intent.md) (2026-10-28) |
| Status | Draft 1 |
| Stage | 2 · Design |

## 1. Summary

Pareto keeps a double-entry ledger in SQLite, an append-only obligation schedule, a per-account cash runway, and a router that moves one full amount between accounts. The first release is a local prototype: a library, a command-line front end, a skill, and a static page. It does not move money at a bank.

## 2. Goals and non-goals

**Goals**

- G1. Post a journal entry only when its lines sum to zero, and report a trial balance from SQL.
- G2. Record contract milestones before a bill exists, and project a cash runway from cleared balances plus open obligations.
- G3. Rank routes for one full amount by fee, lost float, lateness, and delay risk, using rail cutoffs and the 2026 banking calendar.
- G4. Expose those results from `pareto.js`, from the treasury skill, and from `apps/web`, all calling `ledger.js`.

**Non-goals**

- Dividing one payment into several transfers, including transfers sized to stay under a rail maximum or a reporting threshold.
- A schedule whose purpose is to avoid a suspicious-activity report or a structuring control.
- Any behavior in a section the source transcript marks as not captured.
- Inbox parsing, bank aggregation, payment initiation, multi-currency, and a holiday calendar after 2026.
- GitHub Pages. The page runs locally.

**Release phasing.** G1–G4 ship in this prototype. Untagged requirements below belong to this release. Items tagged **Later** wait for a follow-up version.

## 3. Principles

- P1. One business event is one journal entry. Compound lines stay together.
- P2. A debit is a positive cent. A credit is a negative cent. Assets and expenses increase with a debit.
- P3. Obligations are appended. The general ledger is appended. Neither is updated in place.
- P4. The runway includes committed and billed obligations. It excludes cleared ones.
- P5. The router either moves the full amount on a path or it reports that no path can. It never returns a split.
- P6. The page does not keep a second formula.

## 4. Users and scenarios

The owner opens the demo and sees the cabinet contract: project checking still holds $15,000.00 after the deposit, the factory milestone is still open, and the runway does not go negative. They ask how to move $8,500.00 from savings into project checking before Friday, October 30, 2026 at 15:00, starting Thursday at 09:15. The route is same-day ACH into operating checking, then the internal book to project checking, arriving Thursday at 15:05.

They lower the amount to $4,000.00. The direct instant rail is eligible and becomes the first route. They raise it to $5,000.01. That instant rail drops out.

## 5. Functional requirements

1. `ledger.js` exports the schema, ledger operations, the obligation fold, the runway, and `routeLiquidity`. It does not import Node modules.
2. The schema has `accounts`, `entries`, `entry_lines`, and `treasury_events`. Account codes are the cash-pool codes (`CHK_OPS`, `CHK_PROJ`, `SAVINGS`) plus the other demo accounts. Amounts are integer cents.
3. `postEntry` rejects a line of zero cents, fewer than two lines, an unknown account, and a line sum other than zero. A rejection leaves the database unchanged.
4. Treasury events are `CONTRACT_MILESTONE_COMMITTED`, `COMMITMENT_SCHEDULE_SLIPPED`, `INVOICE_RECEIVED_AND_APPROVED`, and `PAYMENT_DISPATCHED`. The first event for an obligation is a commitment. Later events append the next sequence number. The standing amount is the sum of the event amounts. The standing date and account are the latest event's.
5. A commitment stays `COMMITTED` through a schedule slip. An invoice makes it `BILLED`. A dispatch makes it `CLEARED`. Vendor and milestone text stick unless a later payload replaces them.
6. Runway for an account starts at that account's general-ledger balance and then applies open obligations targeted at it, in date order. The deficit date is the first later row whose balance is negative, or none.
7. Rails declare a source, a destination, a fee, a cutoff, a settlement rule, and an optional maximum in cents. An amount above the maximum makes that rail ineligible. The search does not replace it with several smaller hops of the same rail.
8. Settlement rules are instant, same-day (15:00 if before the cutoff, otherwise the next banking day at 15:00), T+1 close (17:00), a hold of N banking days at 17:00, and a same-day hour delay that rolls to the next banking morning after the cutoff. Weekends and the 2026 Federal Reserve holidays in the library are not banking days. Initiation on a closed day snaps to the next banking day at 08:00 before the rail rule runs.
9. A route's cost in cents is the sum of rail fees, lost float at the request's annual yield over the transit, a late penalty when arrival is after the deadline, and a delay-risk premium. Lost float uses a 365-day year. A lateness of one day or less charges one day of per-diem after the fixed late penalty; a longer lateness charges the fractional days, rounded half up to the cent. The first route is the lowest cost, then the earlier arrival.
10. The built-in rails are savings to project checking (instant at or under $5,000.00, otherwise a five-banking-day hold), savings to operating checking (standard ACH and same-day ACH), operating checking to project checking (internal book and Fedwire), and equities to brokerage cash (T+1) then brokerage cash to operating checking (instant).
11. The demo books open on 2026-10-27 with $15,000.00 in operating checking, $25,000.00 in project checking, and $45,000.00 in savings, credited to equity. On 2026-10-28 they capitalize a $10,000.00 cabinet deposit from project checking. Open obligations are the cabinet factory milestone ($8,000.00 on 2026-11-20), cabinet delivery ($2,000.00 on 2026-12-15), tile ($3,500.00 on 2026-11-10), and the permit ($1,200.00 on 2026-11-05 from operating checking). Project runway balances are $15,000.00, $11,500.00, $3,500.00, and $1,500.00, with no deficit.
12. The reference route request is $8,500.00 from `SAVINGS` to `CHK_PROJ`, starting `2026-10-29T09:15`, due `2026-10-30T15:00`, with a $200.00 late penalty, a $50.00 per diem, a 4.50% yield, and a $1,000.00 delay-loss. The first route is `ACH_SAME_DAY` then `INTERNAL_BOOK`, on time, arriving `2026-10-29T15:05`, with a $10.00 rail fee.
13. The CLI commands are `init`, `demo`, `trial-balance`, `post`, `obligations`, `runway`, and `route`. No command exits non-zero and names those commands. `--json` reports cents. `post` takes `--line CODE:debit:DOLLARS` or `--line CODE:credit:DOLLARS`.
14. The skill runs `scripts/pareto.js`, asks for a missing route input, and refuses a request to split a payment or to schedule around a reporting or structuring control.
15. The page shows the demo trial balance, open obligations, the project runway, and the reference routes. Editing the amount reruns `routeLiquidity` on the built-in rails. The production build is what serves the page. `vite dev` is not the supported server.
16. **Later.** Parsing invoices from mail. Posting a journal entry automatically when a payment is dispatched. Storing rails in SQL. Funding one bill from several source accounts. A position blotter for equities. Holiday calendars after 2026. Multi-currency. A SQL assertion that fires inside the engine rather than in `postEntry`. GitHub Pages.

## 6. Acceptance criteria

- AC1. `node --disable-warning=ExperimentalWarning --test` exits 0. The suite rejects an unbalanced entry, posts a three-line payroll entry, appends a slip and an invoice without deleting prior events, skips Veterans Day 2026, matches the demo runway, finds a deficit when a $10,000.00 December 1 obligation is added, and checks the reference route and the $5,000.00 rail boundary.
- AC2. `node pareto.js` exits non-zero and names the commands. `node pareto.js demo --json` reports `balanced: true` and a first hop of `ACH_SAME_DAY`.
- AC3. `pnpm --dir apps/web test` exits 0.
- AC4. `pnpm --dir apps/web test:e2e` opens the page, sees `Books balance.`, a Cabinet Maker row, the same-day route, and, after the amount becomes `4000`, a first route of `ACH_P2P SAVINGS → CHK_PROJ`.

## 7. Design decisions

**D1 — Signed cents.** Debit positive, credit negative, one `amount_cents` column. Two columns would also balance; one signed column is the check the tests already sum. Dollar text with at most two decimal places converts by digits. Verified by the payroll test on 2026-10-28.

**D2 — Cash codes are account codes.** `CHK_PROJ` is both the general-ledger cash account and the obligation's target. A second id would have to be joined, and the demo does not need that.

**D3 — Dispatch does not post the journal.** Cleared cash is a journal entry the caller posts. An automatic bridge can mis-classify a capitalization versus an expense. **Later** in requirement 16. Verified by reading `appendEvent`: it writes `treasury_events` only.

**D4 — Full amount, hard rail maximum.** The $5,000.00 instant rail is a separate edge with `maxCents` 500000. One cent over uses the hold edge or another path. The search never emits two hops that add up to the amount on the same rail. This is the captured clearing rule, not the omitted split procedure.

**D5 — Civil Pacific Time.** Timestamps have no zone suffix and are converted with `Date.UTC`, so the host zone cannot move a cutoff. The holiday list is the 2026 Federal Reserve set written in the source transcript, including Independence Day observed on 2026-07-03. Verified against that list on 2026-10-28. Later years are **Later**.

**D6 — Cost weights for the CLI.** The route command uses the reference penalty, per diem, yield, and delay loss from requirement 12. Extra flags for those weights are **Later**; the library already accepts them.

**D7 — Scaffold.** This repo follows compound: `.cursor/environment.json` runs the install script that pulls `nikolaybotev/local-skills` (that install includes `ai-native-sdlc`), the MIT `LICENSE` text is the same file, and the product is a root `.js` library, a CLI, a skill with a `scripts/` symlink, and a Preact page in `apps/web`. Compound is public and was read on 2026-10-28.

**D8 — SQLite driver.** `node:sqlite` on the Node version pinned in `mise.toml`. The library takes the driver as an argument and does not import it, so the page can call the pure functions. `createLedger` runs the schema. The balance check is in `postEntry` before commit, not a SQL trigger. A trigger is **Later**.

## 8. Open questions

These are deferred on purpose. They do not block this prototype.

1. When a dispatch should create the journal entry, and which accounts it should hit.
2. Whether custom rails belong in a table.
3. How a bill funded from more than one account should be represented without becoming a split of one transfer.
4. Which holiday calendar to load after 2026, and whether cutoffs should carry a real time zone.
5. Whether the page should open a SQLite file in the browser, or keep reading the library's pure demo the way it does now.
