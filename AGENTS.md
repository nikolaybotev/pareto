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
- CI: `.github/workflows/test.yml` runs `node --test` on Node.js 24 with no install step (`test`), and a second job (`web`) that installs the web app with pnpm and runs its unit tests and Playwright. Each job has a 10-minute timeout so a hang fails the check. `.github/workflows/codeql.yml` (workflow `CodeQL`, check **`Analyze (javascript-typescript)`**) runs CodeQL on `javascript-typescript` with `build-mode: none` for pull requests to `main`, pushes to `main`, and a weekly schedule; it needs no install step. Merge waits on `test`, `web`, and **`Analyze (javascript-typescript)`** once Roger requires those checks on `main`.

## Conventions

- Docs follow the solo AI-native SDLC chain: `intent/<change>/intent.md` → `spec.md` → `plan.md`. Update `plan.md` in the same commit when implementation departs from it.
- The ledger and the CLI have no npm dependencies. The page's dependencies live in `apps/web`. Do not add a dependency to `ledger.js` or to the `node --test` job.
- Money is integer cents inside the library and in `--json`. A debit is a positive amount. A credit is a negative amount. Displayed dollars are grouped, with two decimal places.
- Posted journal lines and treasury events are insert-only. A correction is a new entry or a new event.
- The router moves the full amount on one path. A rail with a published maximum below that amount is ineligible. Do not split one payment into several transfers. Do not schedule transfers to stay under a reporting threshold.
- There is no default route. A missing route flag exits non-zero and names `--from`, `--to`, `--amount`, `--start`, and `--deadline`.

## How a change lands

The cycle has four stages: bootstrap, spec and plan, independent review, and build. Bootstrap is done. A new idea is a new `intent/<slug>/` that links to the folder it builds on. The prompt goes under "Original prompt" verbatim. Decisions are numbered `D1`, `D2`, and so on. Leave a question open when it is unanswered. A one-line fix goes straight to a build pull request.

One writer per file. The spec wins over the plan. A departure from the plan is written into `plan.md` in the same commit. Update this file in the same commit when a command or a recurring mistake changes.

Use Cursor models only. Spec and plan are one pull request from one agent on **Grok 4.7 High**. That pull request stays open. A fresh-context agent on **Grok 4.7 High** reads the spec against the intent, then the plan against the spec, and comments. It does not edit those files.

Build is a fresh-context agent on **Composer 2.5**. It reads this file, `REVIEW.md`, the spec, and the plan. One phase is one branch and one pull request. The next phase starts after the previous pull request is merged. The agent runs the checks the plan names, opens the pull request ready for review, and leaves it open.

The coordinator squash-merges only when **`test`**, **`web`**, and **`Analyze (javascript-typescript)`** have succeeded, then deletes the branch. Rebase when the branch is behind `main`. A cancelled check has not succeeded. An admin merge is not a green merge. Do not force-push `main`. Auto-merge stays off.

If a named model cannot be launched, stop and ask. Do not substitute another model.

A report leads with the pull request link and an outcome that can be checked, then says what is next. Report a deploy only after that run has finished.

The `ai-native-sdlc` skill is installed by `.cursor/install.sh` from `nikolaybotev/local-skills`. It stays out of this repo. Product skills live in `.agents/skills/<name>/`. Do not add `CLAUDE.md` or `.claude/skills/`.

Code and tests use fictional counterparties only. See **Personal data** below.

## Personal data

Do not write the owner's personal data into this repository—in intents, specs, plans, examples, test fixtures, docs, commit messages, or pull-request text—even when it came from the owner's messages or a brief. Before you commit, scan what you wrote and replace any personal data with neutral placeholders.

Personal data means street names and addresses; parcel numbers (APNs); loan, account, and other financial figures that belong to the owner; employer details; family and contact details; and IP addresses, keys, or hostnames tied to the owner's home. Names of people, lenders, banks, and other institutions tied to the owner's dealings (for example a loan officer or a bank that extended an offer) are personal data; replace them with neutral placeholders such as "Lender A" or "Bank B". Made-up example names in product fixtures stay. The owner's managed public identity (his name, his picture, his GitHub account, and his name in open-source license files) is not personal data and stays; his own name and GitHub username need no placeholder, while names of other people, lenders, banks, and institutions tied to his dealings still get placeholders.

For mortgage and home-purchase work, dollar amounts, rates, percentages, fees, down-payment scenarios, house prices, closing-cost worksheets, and lender offers are not personal data and may remain in commits and pull requests.

The published demo fixtures in `ledger.js` (the cabinet obligation schedule, the $8,500 reference route, and the demo account balances named in **Commands** above) are the product example. Do not strip or replace them when they are part of that demo.

A real value that must stay in use belongs only in an untracked local file or a secret store, not in git.

## Repository policy

This repository is public. Pull requests merge with squash only. Delete the branch on merge. Auto-merge is off.

Roger configures branch protection and rulesets in GitHub settings. This repo does not ship scripts or workflows that create or change rulesets or branch protection; the Project token cannot.

When Roger adds a ruleset on `main`, it should block branch deletion, block force-push, require linear history, require signed commits, require a pull request, allow only squash merges, require zero approvals, and strictly require these checks: **`test`**, **`web`**, and **`Analyze (javascript-typescript)`**.

Cloud Agent setup is committed: `.cursor/environment.json` runs `bash .cursor/install.sh` (mise, pnpm, the web build, Playwright Chromium, and the local-skills installer) and `bash .cursor/start.sh`. The bootstrap skill allows a no-op start; here `start.sh` serves `vite preview` for Cloud Agents. GitHub Pages deploy is not wired yet; `intent/prototype/spec.md` keeps the page local-only for now.

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
- Playwright's `webServer` command must `exec` the Vite Node process after `pnpm build`. `pnpm exec vite preview` puts Vite in a new process group and leaves it holding the stdout pipe, so the `web` job never exits and GitHub cancels it. A cancelled `web` check has not succeeded.

## Cursor Cloud specific instructions

- `.cursor/environment.json` is the Cloud Agent config. It runs `bash .cursor/install.sh` and `bash .cursor/start.sh`. Agents that start from a commit containing that file use it.
- The environment install installs mise and Node.js 24, enables pnpm 12.6.0, installs the web app, installs Playwright Chromium, and installs skills from `nikolaybotev/local-skills` into `~/.cursor/skills-cursor`, including `ai-native-sdlc`. After activation, `node -v` is 24.
- The start command serves `vite preview` of `apps/web/dist` at `http://127.0.0.1:5173` and returns immediately when that URL is already up. A fresh page shows the demo trial balance, the cabinet obligations, the project runway, and the $8,500 same-day route.
