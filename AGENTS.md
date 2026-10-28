# pareto

A zero-dependency Node.js double-entry ledger, an append-only obligation schedule, and a full-amount liquidity router. The current change is `intent/prototype/`. The page is for the owner, in a browser, with no account and no server.

## Commands

- Install: `mise install` in the repo root installs Node.js 24 from `mise.toml`. Otherwise use Node.js 24. `corepack enable && corepack prepare pnpm@12.6.0 --activate`, then `pnpm install --frozen-lockfile`.
- Demo: `node pareto.js demo` (healthy: `Books balance.` and the $8,500.00 reference route `ACH_SAME_DAY` then `INTERNAL_BOOK`, arriving `2026-10-29T15:05`).
- JSON: `node pareto.js demo --json`. Money fields are integer cents.
- Route: `node pareto.js route --from SAVINGS --to CHK_PROJ --amount 8500 --start 2026-10-29T09:15 --deadline 2026-10-30T15:00`.
- Books: `node pareto.js init --db books.sqlite`, then `demo --db`, `trial-balance --db`, `obligations --db`, `runway --db --account CHK_PROJ`, and `post`.
- Test: `node --disable-warning=ExperimentalWarning --test` or `mise run test`.
- Page: `pnpm --dir apps/web build` then `pnpm --dir apps/web preview`. `pnpm --dir apps/web dev` stays blank because Vite does not turn the CommonJS exports in `ledger.js` into named imports. `pnpm --dir apps/web test` runs the page unit test. `pnpm --dir apps/web test:e2e` runs Playwright against `vite preview`.
- Lint: none.
- CI: `.github/workflows/test.yml` runs `node --test` on Node.js 24 with no install step, and a second job that installs the web app with pnpm and runs its unit tests and Playwright.

## Conventions

- Docs follow the solo AI-native SDLC chain: `intent/<change>/intent.md` → `spec.md` → `plan.md`. Update `plan.md` in the same commit when implementation departs from it.
- The ledger and the CLI have no npm dependencies. The page's dependencies live in `apps/web`. Do not add a dependency to `ledger.js` or to the `node --test` job.
- Money is integer cents inside the library and in `--json`. A debit is a positive amount. A credit is a negative amount. Displayed dollars are grouped, with two decimal places.
- Posted journal lines and treasury events are insert-only. A correction is a new entry or a new event.
- The router moves the full amount on one path. A rail with a published maximum below that amount is ineligible. Do not split one payment into several transfers. Do not schedule transfers to stay under a reporting threshold.
- There is no default route. A missing route flag exits non-zero and names `--from`, `--to`, `--amount`, `--start`, and `--deadline`.

## Architecture

- `ledger.js` is the library. It has no Node APIs. It exports the SQL schema, `createLedger` / `openLedger` for a `node:sqlite`-shaped driver, the obligation fold, the runway, and `routeLiquidity`. The page and the CLI both call it.
- `pareto.js` is the CLI. It opens SQLite, prints, and exits non-zero on a bad argument.
- `.agents/skills/pareto-treasury/SKILL.md` is the chat front end. It runs `scripts/pareto.js`, a symlink to the CLI at the repo root.
- `apps/web` is the page. It imports `buildDemoReport`, `routeLiquidity`, and `defaultRails` from `ledger.js`.
- `intent/prototype/` is the spec and plan for this prototype. The verbatim Gemini capture is `intent/prototype/source-transcript.md`.

## Things agents get wrong

- Do not split one transfer into smaller pieces to qualify for a faster rail or to stay under a threshold. Skip the rail.
- Do not add a scheduler whose purpose is to avoid a suspicious-activity report or a structuring control. Those replies were not captured and are out of scope.
- Do not `UPDATE` or `DELETE` a posted journal line or a treasury event.
- A debit increases an asset. A credit increases a liability, equity, or revenue. Cash leaving a bank account is a credit on these books.
- The page must not grow a second balance or a second router. Call `ledger.js`.
- `pnpm --dir apps/web dev` does not load this library. Use `build` and `preview`.
- The banking calendar is the 2026 Federal Reserve set only. Do not invent later holidays.
- Times are civil `YYYY-MM-DDTHH:MM` values treated as Pacific Time, compared with `Date.UTC` so the machine zone does not move them.
- Dispatching a payment does not post a journal entry. Cleared cash is a journal entry the caller posts separately.
- Do not round currency with `Math.round(dollars * 100)` on the string parser. Dollar strings have at most two decimal places and convert by digits.

## Cursor Cloud specific instructions

- `.cursor/environment.json` is the Cloud Agent config. It runs `bash .cursor/install.sh` and `bash .cursor/start.sh`. The install script installs skills from `nikolaybotev/local-skills` into `~/.cursor/skills-cursor`, including `ai-native-sdlc`, and leaves a skill folder that is already there.
- The environment install installs mise and Node.js 24, enables pnpm 12.6.0, installs the web app, and installs Playwright Chromium. After activation, `node -v` is 24.
- The start command serves `vite preview` of `apps/web/dist` at `http://127.0.0.1:5173` and returns immediately when that URL is already up. A fresh page shows the demo trial balance, the cabinet obligations, the project runway, and the $8,500 same-day route.
