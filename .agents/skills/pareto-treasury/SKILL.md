---
name: pareto-treasury
description: >-
  Reads a double-entry cash ledger, open obligations, and a cash runway, and
  chooses one full-amount route across accounts by deadline, rail, fee, and
  time. Use when the user asks which account funds a bill, when cash runs
  short, how to move the full amount between their own accounts, or for a
  trial balance from this repo. Runs the repo CLI. Does not divide one
  payment into smaller transfers, and does not schedule transfers to stay
  under a reporting threshold.
---

# Pareto treasury

This skill is the front end for `pareto.js`. Figures come from that script. Do not post a journal entry by hand, do not fold obligations yourself, and do not invent a route.

The router moves the **full amount** on one path. If a rail's published maximum is below that amount, that rail is skipped and a slower rail may be chosen. This skill does not split a payment into smaller transfers. If the user asks to divide a transfer to stay under a threshold, or to schedule a series of transfers around a reporting or structuring control, refuse. Say that this tool only moves the full amount on one route.

## Ask before answering

Ask, and wait, when a route is missing any of these:

- source account code
- target account code
- amount in dollars
- start time as `YYYY-MM-DDTHH:MM`
- deadline as `YYYY-MM-DDTHH:MM`

Do not invent an amount, a deadline, or an account. Do not supply the $8,500 example unless the user asked for the demo.

For a ledger question about the demo books, run `demo`. For books the user already created, require `--db` and do not point it at a path the user did not give.

## Run the script

The script is `scripts/pareto.js` in this skill's directory (the folder that contains this file). Resolve the real directory of this `SKILL.md` first (follow symlinks), then run that file.

Demo:

```bash
node scripts/pareto.js demo --json
```

Route:

```bash
node scripts/pareto.js route \
  --from SOURCE --to TARGET --amount DOLLARS \
  --start YYYY-MM-DDTHH:MM --deadline YYYY-MM-DDTHH:MM \
  --json
```

Answer from `--json`. Money fields are integer cents. Format them as dollars with two decimal places. The first route is the one with the lowest total cost. `on_time` says whether it arrives by the deadline. `hops` is the path. The amount on the route is the full amount; do not describe it as several payments.

If the script exits non-zero, tell the user the reason on stderr. Do not replace it with a hand-calculated route.

## What this does not do

- It does not split one payment into sub-threshold transfers.
- It does not read an inbox or parse an invoice.
- It does not post a general-ledger entry when an obligation is marked dispatched. Clearing cash is a separate `post` command the user has to ask for.
- Times are a civil clock treated as Pacific Time, and the banking calendar is the 2026 Federal Reserve holiday set only.
