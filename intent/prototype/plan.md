# plan.md — Pareto prototype

| | |
|---|---|
| Implements | [spec.md](spec.md) Draft 1 |
| Status | Draft 1 |
| Stage | 3 · Build |

Spec wins. Update this file in the same change whenever implementation departs from it.

## Stops

None. The assignment said not to stop for product questions. Open choices are the Later items and the questions in the spec.

## Acceptance-criteria coverage

| AC | Check | Phase |
|---|---|---|
| AC1 | `node --disable-warning=ExperimentalWarning --test` | 0 |
| AC2 | `node pareto.js` and `node pareto.js demo --json` | 0 |
| AC3 | `pnpm --dir apps/web test` | 0 |
| AC4 | `pnpm --dir apps/web test:e2e` | 0 |

## Phase 0 — Prototype

Files: `ledger.js`, `ledger.d.ts`, `pareto.js`, `ledger.test.js`, `.agents/skills/pareto-treasury/`, `apps/web/`, `.cursor/`, `AGENTS.md`, `REVIEW.md`, `README.md`, `.github/workflows/test.yml`

1. Add the compound scaffold: `environment.json`, `install.sh`, `start.sh`, the MIT license, mise, pnpm workspace, and the test workflow.
2. Implement the schema, posting, obligations, runway, rails, and router in `ledger.js`.
3. Implement the CLI, the skill symlink, and the page on that library.
4. Cover AC1–AC4.

DoD: the four checks in the coverage table exit 0.

### Build notes (Phase 0)

Ships in one pull request because the assignment asked for one prototype branch, not a phase per folder. The source transcript is a sibling file of this plan rather than pasted a second time into `intent.md`. No spec requirement was cut to make the tests pass. The page reads `buildDemoReport` and `routeLiquidity`; it does not open SQLite. `vite dev` is unsupported, matching the CommonJS limit recorded for compound's page.
