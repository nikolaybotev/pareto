# pareto

A zero-dependency Node.js ledger for a small set of cash accounts. It posts balanced journal entries in SQLite, keeps future obligations on an append-only schedule, projects each cash account's runway, and chooses one route for the **full** transfer amount. The route weighs the deadline, the rail, the fee, and the time. It does not divide a payment into smaller transfers.

The library is [`ledger.js`](ledger.js). The CLI is [`pareto.js`](pareto.js). The skill is [`.agents/skills/pareto-treasury/SKILL.md`](.agents/skills/pareto-treasury/SKILL.md). The page is [`apps/web`](apps/web). The design is [intent/prototype/](intent/prototype/intent.md). Agents read [`AGENTS.md`](AGENTS.md) for commands, the SDLC cycle, CI checks, and recurring mistakes.

## Requirements

- [Node.js](https://nodejs.org/) 24 or later. `node:sqlite` is part of that runtime. Continuous integration runs the tests on Node.js 24.
- Optional: [mise](https://mise.jdx.dev/). From this directory, `mise install` installs the Node version pinned in `mise.toml`.

## Run

From this directory:

```bash
node pareto.js demo
node pareto.js demo --json
```

Healthy demo output includes `Books balance.` and a reference route of $8,500.00 from `SAVINGS` to `CHK_PROJ` that uses `ACH_SAME_DAY` then `INTERNAL_BOOK` and arrives `2026-10-29T15:05`.

```bash
node pareto.js init --db books.sqlite
node pareto.js demo --db books.sqlite
node pareto.js trial-balance --db books.sqlite
node pareto.js obligations --db books.sqlite
node pareto.js runway --db books.sqlite --account CHK_PROJ
node pareto.js route --from SAVINGS --to CHK_PROJ --amount 8500 \
  --start 2026-10-29T09:15 --deadline 2026-10-30T15:00
```

`--json` on `demo`, `trial-balance`, `obligations`, `runway`, and `route` writes one JSON object. Money fields are integer cents.

`post` adds one balanced journal entry. Amounts are dollars. Debit is positive on the ledger; the flag records the side:

```bash
node pareto.js post --db books.sqlite --date 2026-11-01 --description "Permit accrual" \
  --line CIP:debit:1200 --line AP:credit:1200
```

No command exits non-zero and names `init`, `demo`, `trial-balance`, `post`, `obligations`, `runway`, and `route`.

The page calls the same library. `pnpm --dir apps/web build` writes `apps/web/dist`, and `pnpm --dir apps/web preview` serves that build. `pnpm --dir apps/web dev` stays blank: Vite's dev server does not turn the CommonJS exports in `ledger.js` into the named imports. Use the production build and preview.

## Test

```bash
node --disable-warning=ExperimentalWarning --test
```

With mise installed, `mise run test` runs the same command. `node:sqlite` prints an experimental warning unless that flag is set. The warning is from the runtime, not a failing test.

Page unit tests are `pnpm --dir apps/web test`. End-to-end tests are `pnpm --dir apps/web test:e2e` (first time: `pnpm --dir apps/web exec playwright install --with-deps chromium`).

## License

[MIT](LICENSE)
