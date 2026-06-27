# Eileen Daily Implementation Agent Mode Agent

This file is the repo-local runbook for the daily GPT-5.5 Thinking implementation agent. The daily prompt must explicitly read this file before editing this repo. It converts Daily Deep Research Report issues into one bounded additive PR.

## Repository responsibility

`0xHoneyJar/loa-arcturus` owns proof-of-revenue and revenue-oracle work: x402 settlement shape, anti-sybil revenue filtering, reproducible open meters, Berachain agent-commerce infrastructure, raw vs qualified revenue, and mock/RPC/Dune measurement modes.

Arcturus must not become the product billing repo, Freeside entitlement system, Finn experiment verdict repo, Dixie BFF, Hounfour schema package, Straylight continuity layer, or Aleph research-précis substrate.

## Eligible input

Implement only from a Daily Deep Research Report or follow-up plan-audit item with:

- `PROPOSED_NEXT_LANE_SEED`
- candidate ID
- repo-fit reasoning
- acceptance criteria
- rollback path
- `VERDICT: ACCEPT_PLAN`

Without `VERDICT: ACCEPT_PLAN`, only docs, fixtures, tests, or checkers may be self-audited in-run. Live settlement or oracle behavior requires explicit external acceptance.

## Selection rule

Pick at most one candidate per run. Prefer:

1. docs-only oracle/meter design notes
2. fixture-only settlement-shape examples
3. test-only sybil/filter coverage
4. checker/validator-only additions
5. default-off measurement helpers

## Additive-only policy

Allowed by default:

- new docs
- new fixtures
- new tests
- new deterministic checkers
- settlement-shape drift sentinels
- default-off measurement helpers

Forbidden without explicit Eileen approval:

- deleting files
- claiming mock data proves real revenue
- changing raw/qualified revenue semantics by default
- changing live RPC/Dune behavior by default
- broad refactors
- unrelated dependency upgrades
- sibling repo mutation
- auto-merge
- closing source issues

## Arcturus-specific stop conditions

Stop and return `VERDICT: NEEDS_HUMAN` if the candidate would alter live payment/oracle behavior, weaken anti-sybil filtering, collapse raw and qualified revenue, or make unsupported economy claims.

## Implementation steps

1. Read this file, README/package scripts, and nearby docs.
2. Confirm the source item has `VERDICT: ACCEPT_PLAN`.
3. Check for obvious duplicate open issues/PRs.
4. Write a short plan: candidate, implementation class, allowed files, checks, rollback.
5. Create a branch named `daily-impl/YYYY-MM-DD-loa-arcturus-<candidate>`.
6. Implement exactly one candidate with a minimal diff.
7. Run relevant checks.
8. Open a draft PR.
9. Add `CODEX AUDIT REQUEST` to the PR body.
10. Comment: `@codex review for additive-only scope violations, oracle/revenue semantic regressions, accidental live-settlement behavior changes, failing or missing tests, rollback clarity, repo-boundary violations, and security regressions`.
11. Do not merge and do not close the source issue.

## PR body requirements

Include source issue, candidate ID, implementation class, what changed, what did not change, checks run, skipped or failing checks, rollback path, and Codex audit request.

## Final run report

Report selected repo, source issue, branch, PR URL, files changed, checks run, Codex review status, blockers, and boundaries approached.
