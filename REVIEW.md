# Review instructions

## Passes

Run three passes and tag each finding with its pass:

- **Bugs:** a journal entry that posts when its lines do not sum to zero; a trial balance whose debit total does not equal its credit total; a treasury event that updates a prior row instead of appending; a cleared obligation that still reduces runway; a runway that ignores a committed unbilled obligation; a route that divides one amount into several transfers; a route that uses a rail whose published maximum is below the amount; a route whose arrival disagrees with `routeLiquidity` for the same rails and timestamps; a page figure that disagrees with `buildDemoReport` or `routeLiquidity`.
- **Security:** secrets or personal financial files committed to the repo; unexpected network or dependencies on the `node --test` job; reading or writing a path other than the `--db` file the user passed.
- **Compliance:** the change matches the spec and plan in the current intent folder named in `AGENTS.md`, and the conventions in `AGENTS.md`. A departure from the plan that is not written back into `plan.md` in the same change is a compliance finding. Shipping a payment split, or a schedule meant to avoid a reporting or structuring control, is a compliance finding even when a caller asks for it.

## What Important means here

Reserve Important for a ledger that posts out of balance, a runway that hides spoken-for cash, a route that splits a payment or schedules around a reporting threshold, or a page that disagrees with `ledger.js`. Style and naming are nits.

## Cap the nits

Report at most five nits per review; summarize the rest as a count.

## Writing

Tag **Writing** on each finding:

- **Self-reference:** this repo's GitHub owner, name, or URL hardcoded in prose, docs, scripts, or workflows instead of "this repo" or a derived value (`git remote`, `GITHUB_REPOSITORY`, `${{ github.repository }}`, `${{ github.repository_owner }}`). References to other repositories are fine.
- **Variable config:** the current value of a pin, env var, secret, or config key copied into docs, tests, or workflows instead of naming the setting or file (for example `mise.toml` or the `packageManager` field in `package.json`).
- **Obvious:** notes a competent reader already knows, such as `(healthy: exit 0)`.

## Do not report

Formatting the CI already enforces, generated files the repo ignores, and wording inside the verbatim prompt block of any `intent.md`.
